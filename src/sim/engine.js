// Mesin simulasi kejadian diskret + kinematika langkah tetap. Berjalan headless (tanpa Three.js/DOM).
import { deepClone } from '../config/index.js';
import { SIM_STEP_SECONDS } from '../config/operations.js';
import { PRODUCT_IDS } from '../config/products.js';
import { vehicleExtents } from '../config/vehicles.js';
import { buildLayout, footprintAt, HEADING } from '../geometry/layout.js';
import { buildNetwork } from '../geometry/routes.js';
import { validateRoute, rectPoly, circlePoly } from '../geometry/sweptPath.js';
import { validateStalls, parkedPose } from '../geometry/parking.js';
import { validateConfig } from '../geometry/validation.js';
import { EventQueue } from './events.js';
import { deriveStreams, hashString } from './rng.js';
import { hourOfDay } from './clock.js';
import { Truck, TRUCK_STATES } from './models/truck.js';
import { Bay, BAY_STATES } from './models/bay.js';
import { runDispatch } from './dispatch.js';
import { Traffic } from './traffic.js';
import { Collector } from '../metrics/collector.js';
import { computeTravelTimes, computeTheory } from '../metrics/theory.js';

export const DEADLOCK_MESSAGE = 'Kebuntuan lalu lintas terdeteksi';
const DEADLOCK_SECONDS = 600;
const MAX_DRAWN_HOLDING = 3;

export class Engine {
  constructor(config, { presetId = 'baseline' } = {}) {
    this.config = deepClone(config);
    this.presetId = presetId;
    this.configErrors = validateConfig(this.config);
    if (this.configErrors.length) {
      const err = new Error('Konfigurasi tidak valid: ' + this.configErrors.map((e) => e.code).join(', '));
      err.errors = this.configErrors;
      throw err;
    }
    this.dt = SIM_STEP_SECONDS;
    this.buildGeometry();
    this.reset();
  }

  // ---------- Geometri (dihitung ulang hanya saat konfigurasi geometri berubah) ----------
  buildGeometry() {
    const cfg = this.config;
    this.layout = buildLayout(cfg);
    this.network = buildNetwork(this.layout, cfg);
    this.ext = vehicleExtents(cfg.vehicle);
    this.geometryReport = this.validateGeometry();
    this.feasibleStalls = this.geometryReport.stalls.stalls.filter((s) => s.feasible).map((s) => s.index);
    this.effectiveCapacity = this.feasibleStalls.length;
    this.travelTimes = computeTravelTimes(this.layout, this.network, cfg, this.feasibleStalls);
  }

  staticObstacles() {
    const f = this.config.facility;
    const obs = [];
    for (const c of this.layout.columns) obs.push({ id: `kolom(${c.x},${c.z})`, kind: 'column', poly: rectPoly(c.x - c.size / 2, c.z - c.size / 2, c.x + c.size / 2, c.z + c.size / 2) });
    for (const e of this.layout.equipment) obs.push({ id: `peralatan-bay${e.bay}`, kind: 'equipment', poly: rectPoly(e.x0, e.z0, e.x1, e.z1) });
    for (const b of f.context.buildings) obs.push({ id: `bangunan-${b.name}`, kind: 'building', poly: rectPoly(b.x0, b.z0, b.x1, b.z1) });
    for (const t of f.context.tankGroups) obs.push({ id: `tangki(${t.x},${t.z})`, kind: 'tank', poly: circlePoly(t.x, t.z, t.radius) });
    return obs;
  }

  validateGeometry() {
    const cfg = this.config;
    const v = cfg.vehicle;
    const statics = this.staticObstacles();
    const bounds = {
      width: cfg.facility.plot.width,
      length: cfg.facility.plot.length,
      gateCorridors: [
        { z: cfg.facility.gates.entrance.z, halfWidth: cfg.facility.roads.width / 2 + 1 },
        { z: cfg.facility.gates.exit.z, halfWidth: cfg.facility.roads.width / 2 + 1 },
      ],
    };
    const stalls = validateStalls(this.layout, this.network, cfg, statics, bounds);
    const bays = this.layout.bays.map((b, j) => {
      const neighbors = [];
      for (const dj of [-1, 1]) {
        const n = this.layout.bays[j + dj];
        if (n) neighbors.push({ id: `bay${n.number}:truk`, kind: 'truck', poly: footprintAt({ x: n.serviceAxle.x, z: n.serviceAxle.z, theta: HEADING.north }, v) });
      }
      const obstacles = [...statics, ...neighbors];
      const entry = validateRoute(this.network.bayManeuvers[j].entry, v, obstacles, bounds, v.clearance);
      const exit = validateRoute(this.network.bayManeuvers[j].exit, v, obstacles, bounds, v.clearance);
      return { bay: b.number, index: j, feasible: entry.feasible && exit.feasible, entry, exit, minClearance: Math.min(entry.minClearance ?? Infinity, exit.minClearance ?? Infinity) };
    });
    const uTurn = validateRoute(this.network.uTurn, v, statics, bounds, v.clearance);
    const errors = [];
    if (this.network.uTurnRadius < v.turningRadius - 1e-9) {
      errors.push({ code: 'uTurnTooTight', detail: { available: this.network.uTurnRadius, required: v.turningRadius } });
    }
    return { stalls, bays, uTurn, errors, allFeasible: stalls.stalls.every((s) => s.feasible) && bays.every((b) => b.feasible) && uTurn.feasible && !errors.length };
  }

  // ---------- Run baru ----------
  reset() {
    const ops = this.config.operations;
    this.truckSeq = 0;
    this.time = 0;
    this.stepCount = 0;
    this.horizon = ops.calendar.horizonHours * 3600;
    this.horizonReached = false;
    this.autoPaused = false;
    this.deadlock = null;
    this.lastMoveTime = 0;
    this.events = new EventQueue();
    this.streams = deriveStreams(ops.seed, ['arrivals', 'products', 'service']);
    this.trucks = new Map();
    this.holding = []; // truk antre di gerbang (urut kedatangan)
    this.bays = this.layout.bays.map((b) => new Bay(b));
    this.stalls = this.layout.stalls.map((s) => ({ ...s, truckId: null, feasible: this.feasibleStalls.includes(s.index) }));
    for (const seg of this.network.allSegments) seg.occupants.clear();
    this.traffic = new Traffic(this.config.vehicle, this.dt);
    this.collector = new Collector(this.horizon, 60);
    this.log = [];
    this.logHash = 2166136261 >>> 0;
    this.pendingArrival = null;
    this.scheduleNextArrival();
    this.events.schedule(this.horizon, 'horizon');
    this.events.schedule(this.collector.sampleInterval, 'sample');
    this.collector.sample(0, this);
    this.recomputeTheory();
    this.listeners = this.listeners || new Set();
  }

  // ---------- Log kejadian (untuk hash determinisme) ----------
  logEvent(type, data = {}) {
    const entry = { t: +this.time.toFixed(4), type, ...data };
    this.log.push(entry);
    const s = JSON.stringify(entry);
    let h = this.logHash;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    this.logHash = h;
    if (this.listeners) for (const l of this.listeners) l(entry);
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- Kedatangan ----------
  arrivalRateNow(t) {
    const ops = this.config.operations;
    let rate = ops.arrivalRatePerHour / 3600;
    if (ops.hourlyProfileEnabled) rate *= ops.hourlyProfile[hourOfDay(t, ops.calendar)];
    return rate;
  }

  scheduleNextArrival() {
    const ops = this.config.operations;
    if (this.pendingArrival) {
      this.events.cancel(this.pendingArrival);
      this.pendingArrival = null;
    }
    if (!(ops.arrivalRatePerHour > 0)) return;
    const rng = this.streams.arrivals;
    const base = ops.arrivalRatePerHour / 3600;
    let t = this.time;
    if (ops.hourlyProfileEnabled) {
      const max = Math.max(...ops.hourlyProfile);
      if (!(max > 0)) return;
      const lambdaMax = base * max;
      for (let guard = 0; guard < 100000; guard++) {
        t += rng.exponential(lambdaMax);
        const accept = this.arrivalRateNow(t) / lambdaMax;
        if (rng.uniform() <= accept) break;
      }
    } else {
      t += rng.exponential(base);
    }
    this.pendingArrival = this.events.schedule(t, 'arrival');
  }

  drawProduct() {
    const shares = this.config.operations.demandShares;
    const weights = PRODUCT_IDS.map((p) => shares[p] || 0);
    return PRODUCT_IDS[this.streams.products.weightedIndex(weights)];
  }

  handleArrival() {
    const ops = this.config.operations;
    this.truckSeq += 1;
    const truck = new Truck({ id: this.truckSeq, product: this.drawProduct(), requestedVolume: ops.requestedVolumeL, arrivalTime: this.time });
    this.trucks.set(truck.id, truck);
    this.collector.onArrival();
    this.holding.push(truck);
    this.logEvent('arrival', { truck: truck.id, product: truck.product });
    this.admitFromHolding();
    this.scheduleNextArrival();
  }

  // ---------- Gerbang dan stall ----------
  freeStall() {
    // Stall bebas terdekat dengan ujung keberangkatan (X tertinggi), hanya stall yang layak.
    for (let k = this.stalls.length - 1; k >= 0; k--) {
      const st = this.stalls[k];
      if (st.feasible && st.truckId == null) return st;
    }
    return null;
  }

  admitFromHolding() {
    while (this.holding.length) {
      const stall = this.freeStall();
      if (!stall) return;
      const truck = this.holding.shift();
      stall.truckId = truck.id;
      truck.stall = stall.index;
      truck.state = TRUCK_STATES.TO_STALL;
      truck.timestamps.facilityEntry = this.time;
      this.collector.onAdmit(this.time);
      this.logEvent('admit', { truck: truck.id, stall: stall.number });
      if (truck.spawned) {
        const curIdx = this.network.entryLine.indexOf(truck.currentSegment);
        this.traffic.extendRoute(truck, this.network.routes.toStall(stall.index, Math.max(0, curIdx)));
      }
    }
  }

  releaseStall(truck) {
    const st = this.stalls[truck.stall];
    if (st && st.truckId === truck.id) st.truckId = null;
    truck.stall = null;
    this.logEvent('leaveStall', { truck: truck.id, stall: st.number });
    this.admitFromHolding();
  }

  trySpawn() {
    // Truk belum berposisi fisik: antre gerbang (maks 3 digambar) dan truk yang sudah diterima.
    const drawnHolding = this.holding.filter((t) => t.spawned).length;
    for (const truck of this.trucks.values()) {
      if (truck.spawned || truck.state === TRUCK_STATES.EXITED) continue;
      if (truck.state === TRUCK_STATES.HOLDING && drawnHolding >= MAX_DRAWN_HOLDING) return;
      const gap = this.traffic.spawnGap(this.network.entryLine.slice(0, 5));
      if (gap < this.config.vehicle.stationaryGap) return;
      truck.spawned = true;
      if (truck.state === TRUCK_STATES.HOLDING) {
        truck.routeEndOffset = this.ext.front + this.config.vehicle.clearance;
        this.traffic.setRoute(truck, this.network.routes.gateHold(0), 0, 0);
      } else {
        truck.routeEndOffset = 0;
        this.traffic.setRoute(truck, this.network.routes.toStall(truck.stall, 0), 0, 0);
      }
      this.lastMoveTime = this.time;
      return; // satu spawn per langkah agar jarak terjaga
    }
  }

  // ---------- Dispatch ----------
  dispatch() {
    const ops = this.config.operations;
    const assignments = runDispatch([...this.trucks.values()], this.bays, ops.protection.passCount, (t, why) =>
      this.logEvent('protected', { truck: t.id, why }),
    );
    for (const { truck, bay } of assignments) {
      bay.reservedAt = this.time;
      truck.timestamps.dispatch = this.time;
      truck.snapshot = this.serviceSnapshot(truck);
      if (truck.protectEvent) {
        this.events.cancel(truck.protectEvent);
        truck.protectEvent = null;
      }
      this.traffic.setRoute(truck, this.network.routes.stallToBay(truck.stall, bay.index), 0, 0);
      truck.routeEndOffset = 0;
      this.logEvent('dispatch', { truck: truck.id, bay: bay.number });
    }
    return assignments;
  }

  serviceSnapshot(truck) {
    const ops = this.config.operations;
    const cv = ops.serviceCV;
    const rng = this.streams.service;
    const prep = ops.prepMinutes * 60;
    const comp = ops.completionMinutes * 60;
    const load = (truck.requestedVolume / ops.loadingRateLpm) * 60;
    return {
      loadingRateLpm: ops.loadingRateLpm,
      prepMinutes: ops.prepMinutes,
      completionMinutes: ops.completionMinutes,
      requestedVolume: truck.requestedVolume,
      prepSec: cv > 0 ? rng.lognormal(prep, cv) : prep,
      loadSec: cv > 0 ? rng.lognormal(load, cv) : load,
      completionSec: cv > 0 ? rng.lognormal(comp, cv) : comp,
    };
  }

  // ---------- Transisi yang dipicu gerakan ----------
  onTruckRouteEnd(truck) {
    if (truck.state === TRUCK_STATES.TO_STALL) {
      this.traffic.clearRoute(truck);
      truck.pose = { ...parkedPose(this.stalls[truck.stall]) };
      truck.footprint = footprintAt(truck.pose, this.config.vehicle);
      truck.state = TRUCK_STATES.WAITING;
      truck.timestamps.queueEntry = this.time;
      const waitSec = this.config.operations.protection.waitMinutes * 60;
      truck.protectEvent = this.events.schedule(this.time + waitSec, 'protect', { truck: truck.id });
      this.logEvent('park', { truck: truck.id, stall: truck.stall + 1 });
      this.dispatch();
    } else if (truck.state === TRUCK_STATES.TO_BAY) {
      this.traffic.clearRoute(truck);
      const bay = this.bays[truck.bay - 1];
      truck.timestamps.bayArrival = this.time;
      truck.state = TRUCK_STATES.PREP;
      this.setBayState(bay, BAY_STATES.PREP);
      this.events.schedule(this.time + truck.snapshot.prepSec, 'prepEnd', { truck: truck.id });
      this.logEvent('bayArrival', { truck: truck.id, bay: bay.number });
    } else if (truck.state === TRUCK_STATES.HOLDING) {
      // berhenti di gerbang; tetap memegang rute (akan diperpanjang saat diterima)
    }
  }

  setBayState(bay, state) {
    bay.accrue(this.time);
    bay.state = state;
  }

  checkBayClear(truck) {
    const noseZ = truck.pose.z + Math.sin(truck.pose.theta) * this.ext.front;
    if (noseZ >= this.config.facility.bays.clearZ - 1e-9) {
      const bay = this.bays[truck.bay - 1];
      bay.accrue(this.time);
      bay.committedTotal += this.time - bay.reservedAt;
      bay.serviceCount += 1;
      bay.truckId = null;
      bay.reservedAt = null;
      truck.timestamps.bayClear = this.time;
      truck.state = TRUCK_STATES.TO_EXIT;
      if (bay.pendingDeactivation) {
        bay.pendingDeactivation = false;
        bay.active = false;
        bay.state = BAY_STATES.INACTIVE;
      } else {
        bay.state = BAY_STATES.AVAILABLE;
      }
      if (bay.pendingProducts) {
        bay.products = bay.pendingProducts;
        bay.pendingProducts = null;
        this.logEvent('bayProducts', { bay: bay.number, products: bay.products });
      }
      this.logEvent('bayClear', { truck: truck.id, bay: bay.number });
      this.dispatch();
    }
  }

  checkExit(truck) {
    const rearX = truck.pose.x - Math.cos(truck.pose.theta) * this.ext.rear;
    if (rearX < 0) {
      this.traffic.clearRoute(truck);
      truck.state = TRUCK_STATES.EXITED;
      truck.timestamps.exit = this.time;
      truck.pose = null;
      truck.footprint = null;
      truck.fpoly = null;
      this.collector.onExit(truck, this.time);
      this.logEvent('exit', { truck: truck.id });
      this.trucks.delete(truck.id);
      this.exitedTrucks = (this.exitedTrucks || 0) + 1;
    }
  }

  // ---------- Kejadian ----------
  handleEvent(ev) {
    const p = ev.payload;
    switch (ev.type) {
      case 'arrival':
        this.pendingArrival = null;
        this.handleArrival();
        break;
      case 'prepEnd': {
        const truck = this.trucks.get(p.truck);
        if (!truck) break;
        const bay = this.bays[truck.bay - 1];
        truck.state = TRUCK_STATES.LOADING;
        truck.timestamps.loadingStart = this.time;
        this.setBayState(bay, BAY_STATES.LOADING);
        this.events.schedule(this.time + truck.snapshot.loadSec, 'loadEnd', { truck: truck.id });
        this.logEvent('loadingStart', { truck: truck.id, bay: bay.number });
        break;
      }
      case 'loadEnd': {
        const truck = this.trucks.get(p.truck);
        if (!truck) break;
        const bay = this.bays[truck.bay - 1];
        truck.loadedVolume = truck.requestedVolume;
        truck.timestamps.loadingEnd = this.time;
        truck.state = TRUCK_STATES.COMPLETION;
        this.setBayState(bay, BAY_STATES.COMPLETION);
        this.collector.onLoaded(truck.product, truck.requestedVolume);
        this.events.schedule(this.time + truck.snapshot.completionSec, 'completionEnd', { truck: truck.id });
        this.logEvent('loadingEnd', { truck: truck.id, bay: bay.number, volume: truck.requestedVolume });
        break;
      }
      case 'completionEnd': {
        const truck = this.trucks.get(p.truck);
        if (!truck) break;
        const bay = this.bays[truck.bay - 1];
        truck.state = TRUCK_STATES.CLEARING;
        this.setBayState(bay, BAY_STATES.CLEARING);
        this.traffic.setRoute(truck, this.network.routes.bayToExit(bay.index), 0, 0);
        truck.routeEndOffset = 0;
        this.logEvent('clearingStart', { truck: truck.id, bay: bay.number });
        break;
      }
      case 'protect': {
        const truck = this.trucks.get(p.truck);
        if (truck && truck.state === TRUCK_STATES.WAITING && !truck.protected) {
          truck.protected = true;
          this.logEvent('protected', { truck: truck.id, why: 'wait' });
          this.dispatch();
        }
        break;
      }
      case 'sample':
        for (const b of this.bays) b.accrue(this.time);
        this.collector.sample(this.time, this);
        this.events.schedule(this.time + this.collector.sampleInterval, 'sample');
        break;
      case 'horizon':
        this.horizonReached = true;
        this.autoPaused = true;
        for (const b of this.bays) b.accrue(this.time);
        this.collector.sample(this.time, this);
        this.logEvent('horizon', {});
        break;
      default:
        break;
    }
  }

  // ---------- Langkah utama ----------
  step() {
    const t1 = this.time + this.dt;
    const travelling = [];
    for (const t of this.trucks.values()) if (t.travelling) travelling.push(t);
    const anySpawnPending = [...this.trucks.values()].some((t) => !t.spawned);
    if (!travelling.length && !anySpawnPending) {
      // Tidak ada yang bergerak: lompat ke kejadian berikutnya (identik untuk semua kecepatan playback).
      const ev = this.events.peek();
      if (ev && ev.time > t1) {
        this.time = ev.time;
        this.events.pop();
        this.handleEvent(ev);
        this.stepCount++;
        return;
      }
    }
    for (;;) {
      const ev = this.events.peek();
      if (!ev || ev.time > t1 + 1e-9) break;
      this.events.pop();
      this.time = ev.time;
      this.handleEvent(ev);
    }
    this.time = t1;
    this.stepCount++;
    this.trySpawn();

    const moving = [];
    for (const t of this.trucks.values()) if (t.travelling) moving.push(t);
    moving.sort((a, b) => a.id - b.id);
    const all = [...this.trucks.values()];
    this.traffic.processAcquisitions(moving, all, this.time);
    const maneuvering = all.filter((o) => o.spawned && o.fpoly && (!o.curSeg || !o.curSeg.lane));
    let anyMoved = false;
    for (const t of moving) {
      const prevHeading = t.pose.theta;
      const movedNow = this.traffic.stepTruck(t, maneuvering);
      if (movedNow) {
        anyMoved = true;
        if (t.state === TRUCK_STATES.TO_BAY && t.stall != null && t.routeIndex > 0) this.releaseStall(t);
        this.updateLoadedVolume(t);
        if (t.state === TRUCK_STATES.CLEARING) this.checkBayClear(t);
        if (t.state === TRUCK_STATES.TO_EXIT) this.checkExit(t);
        if (t.state !== TRUCK_STATES.EXITED && t.atRouteEnd) this.onTruckRouteEnd(t);
      } else if (Math.abs(t.pose.theta - prevHeading) > 1e-9) {
        throw new Error('truk berputar di tempat');
      }
    }
    for (const t of this.trucks.values()) {
      if (t.state === TRUCK_STATES.LOADING) this.updateLoadedVolume(t);
    }
    if (anyMoved) this.lastMoveTime = this.time;
    else if (!this.deadlock && moving.some((t) => t.blocked) && this.time - this.lastMoveTime >= DEADLOCK_SECONDS) {
      this.deadlock = { time: this.time, trucks: moving.filter((t) => t.blocked).map((t) => t.id) };
      this.autoPaused = true;
      this.logEvent('deadlock', { message: DEADLOCK_MESSAGE, trucks: this.deadlock.trucks });
    }
  }

  updateLoadedVolume(truck) {
    if (truck.state === TRUCK_STATES.LOADING && truck.snapshot) {
      const frac = Math.min(1, (this.time - truck.timestamps.loadingStart) / truck.snapshot.loadSec);
      truck.loadedVolume = Math.min(truck.requestedVolume, frac * truck.requestedVolume);
    }
  }

  // Hash FNV-1a dari log kejadian hingga waktu tertentu (untuk uji determinisme antar kecepatan playback).
  logHashUntil(t = Infinity) {
    let h = 2166136261 >>> 0;
    for (const e of this.log) {
      if (e.t > t + 1e-9) break;
      const s = JSON.stringify(e);
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h >>> 0;
  }

  stepMany(n) {
    for (let i = 0; i < n; i++) this.step();
  }

  runUntil(t) {
    let guard = 0;
    while (this.time < t - 1e-9 && guard++ < 50_000_000) this.step();
  }

  // ---------- Perintah pengguna ----------
  setArrivalRate(perHour) {
    if (!(perHour >= 0)) return false;
    this.config.operations.arrivalRatePerHour = perHour;
    this.scheduleNextArrival();
    this.recomputeTheory();
    this.logEvent('cmd', { what: 'arrivalRate', value: perHour });
    return true;
  }

  setDemandShares(shares) {
    const total = Object.values(shares).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.0001 || Object.values(shares).some((x) => x < 0)) return false;
    this.config.operations.demandShares = { ...shares };
    this.recomputeTheory();
    return true;
  }

  setServiceParams({ requestedVolumeL, loadingRateLpm, prepMinutes, completionMinutes }) {
    const ops = this.config.operations;
    if (requestedVolumeL != null) {
      if (!(requestedVolumeL > 0)) return false;
      ops.requestedVolumeL = requestedVolumeL;
    }
    if (loadingRateLpm != null) {
      if (!(loadingRateLpm > 0)) return false;
      ops.loadingRateLpm = loadingRateLpm;
    }
    if (prepMinutes != null) {
      if (prepMinutes < 0) return false;
      ops.prepMinutes = prepMinutes;
    }
    if (completionMinutes != null) {
      if (completionMinutes < 0) return false;
      ops.completionMinutes = completionMinutes;
    }
    this.recomputeTheory();
    return true;
  }

  setProtection({ passCount, waitMinutes }) {
    const p = this.config.operations.protection;
    if (passCount != null) {
      if (passCount < 0) return false;
      p.passCount = passCount;
    }
    if (waitMinutes != null) {
      if (waitMinutes < 0) return false;
      p.waitMinutes = waitMinutes;
    }
    return true;
  }

  setHourlyProfile(enabled, profile) {
    const ops = this.config.operations;
    if (enabled) {
      if (!Array.isArray(profile) || profile.length !== 24 || profile.some((m) => m < 0)) return false;
      const avg = profile.reduce((a, b) => a + b, 0) / 24;
      if (Math.abs(avg - 1) > 0.0001) return false;
      ops.hourlyProfile = [...profile];
    }
    ops.hourlyProfileEnabled = !!enabled;
    this.scheduleNextArrival();
    this.recomputeTheory();
    return true;
  }

  setServiceCV(cv) {
    if (cv < 0) return false;
    this.config.operations.serviceCV = cv;
    return true;
  }

  setBayActive(number, active) {
    const bay = this.bays[number - 1];
    if (!bay) return false;
    if (active) {
      bay.accrue(this.time);
      if (bay.pendingDeactivation) {
        bay.pendingDeactivation = false;
        bay.active = true;
      } else if (!bay.active) {
        bay.active = true;
        bay.state = BAY_STATES.AVAILABLE;
      }
      this.config.bays[number - 1].active = true;
      this.logEvent('bayActivate', { bay: number });
      this.recomputeTheory();
      this.dispatch();
    } else {
      bay.accrue(this.time);
      if (bay.state === BAY_STATES.AVAILABLE) {
        bay.active = false;
        bay.state = BAY_STATES.INACTIVE;
      } else if (bay.active) {
        bay.active = false;
        bay.pendingDeactivation = true; // selesaikan truk saat ini, lalu nonaktif
      }
      this.config.bays[number - 1].active = false;
      this.logEvent('bayDeactivate', { bay: number, pending: bay.pendingDeactivation });
      this.recomputeTheory();
    }
    return true;
  }

  setBayProducts(number, products) {
    const bay = this.bays[number - 1];
    if (!bay) return false;
    if (!Array.isArray(products) || products.length !== 3 || new Set(products).size !== 3) return false;
    if (!products.every((p) => PRODUCT_IDS.includes(p))) return false;
    if (bay.committed) {
      bay.pendingProducts = [...products];
      this.logEvent('bayProductsPending', { bay: number, products });
    } else {
      bay.products = [...products];
      this.logEvent('bayProducts', { bay: number, products });
      this.dispatch();
    }
    this.config.bays[number - 1].products = [...products];
    this.recomputeTheory();
    return true;
  }

  setSeed(seed) {
    this.config.operations.seed = seed >>> 0;
  }

  // ---------- Teori ----------
  recomputeTheory() {
    this.theory = computeTheory({ travelTimes: this.travelTimes, bays: this.bays, operations: this.config.operations });
    return this.theory;
  }

  // ---------- Ringkasan ----------
  liveCounts() {
    const trucks = [...this.trucks.values()];
    const byState = {};
    for (const t of trucks) byState[t.state] = (byState[t.state] || 0) + 1;
    const queueByProduct = {};
    for (const t of trucks) if (t.state === TRUCK_STATES.WAITING) queueByProduct[t.product] = (queueByProduct[t.product] || 0) + 1;
    const toBay = trucks.filter((t) => t.state === TRUCK_STATES.TO_BAY);
    return {
      holding: this.holding.length,
      waiting: byState[TRUCK_STATES.WAITING] || 0,
      effectiveCapacity: this.effectiveCapacity,
      reserved: toBay.length,
      travellingToBay: toBay.filter((t) => t.route && t.routeIndex > 0 || (t.route && t.s > 0)).length,
      availableBays: this.bays.filter((b) => b.state === BAY_STATES.AVAILABLE).length,
      committedBays: this.bays.filter((b) => b.committed).length,
      inactiveBays: this.bays.filter((b) => b.state === BAY_STATES.INACTIVE).length,
      exited: this.collector.exited,
      exitedAfterHorizon: this.collector.exitedAfterHorizon,
      arrivals: this.collector.arrivals,
      inFacility: this.collector.nFacility,
      inSystem: trucks.length,
      queueByProduct,
      volumeByProduct: { ...this.collector.volumeByProduct },
      totalVolume: this.collector.totalVolume(),
      byState,
    };
  }

  bayStats() {
    return this.bays.map((b) => {
      b.accrue(this.time);
      const act = b.stats.activeTime;
      return {
        bay: b.number,
        state: b.displayState,
        active: b.active,
        pendingDeactivation: b.pendingDeactivation,
        products: [...b.products],
        pendingProducts: b.pendingProducts,
        truckId: b.truckId,
        serviceCount: b.serviceCount,
        activeTime: act,
        loadingUtilization: act > 0 ? b.stats.loadingTime / act : null,
        commitment: act > 0 ? b.stats.committedTime / act : null,
        committedTotal: b.committedTotal,
      };
    });
  }

  observedCommitment() {
    let num = 0, den = 0;
    for (const b of this.bays) {
      b.accrue(this.time);
      num += b.stats.committedTime;
      den += b.stats.activeTime;
    }
    return den > 0 ? num / den : null;
  }

  summary() {
    const counts = this.liveCounts();
    const tm = this.collector.timeMetrics(this, { withinHorizon: true });
    const unfinished = [...this.trucks.values()].map((t) => this.collector.record(t, this.time, 'belum selesai'));
    const hours = Math.min(this.time, this.horizon) / 3600;
    return {
      presetId: this.presetId,
      seed: this.config.operations.seed,
      time: this.time,
      horizonReached: this.horizonReached,
      effectiveCapacity: this.effectiveCapacity,
      theory: { mu: this.theory.mu, rho: this.theory.rho, worstSubset: this.theory.worstSubset, status: this.theory.status },
      counts,
      exitedWithinHorizon: this.collector.exited - this.collector.exitedAfterHorizon,
      throughputPerHour: hours > 0 ? (this.collector.exited - this.collector.exitedAfterHorizon) / hours : null,
      observedCommitment: this.observedCommitment(),
      timeMetrics: tm,
      unfinished,
      unfinishedCount: unfinished.length,
      maxQueue: Math.max(0, ...this.collector.series.filter((s) => !s.afterHorizon).map((s) => s.queue)),
      maxHolding: Math.max(0, ...this.collector.series.filter((s) => !s.afterHorizon).map((s) => s.holding)),
      totalVolume: this.collector.totalVolume(),
      volumeByProduct: { ...this.collector.volumeByProduct },
      bays: this.bayStats(),
      littles: this.collector.littlesLaw(this, this.time),
      deadlock: this.deadlock,
      logHash: this.logHash.toString(16),
      config: deepClone(this.config),
    };
  }
}

export { hashString };
