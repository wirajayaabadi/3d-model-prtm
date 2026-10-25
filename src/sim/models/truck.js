// Model truk: status operasional, rute, pose, stempel waktu dan snapshot parameter servis.
export const TRUCK_STATES = {
  HOLDING: 'holding', // antre di gerbang masuk
  TO_STALL: 'toStall', // menuju area tunggu
  WAITING: 'waiting', // menunggu panggilan di stall
  TO_BAY: 'toBay', // dipanggil, menuju bay (termasuk menunggu jalur bebas di stall)
  PREP: 'prep',
  LOADING: 'loading',
  COMPLETION: 'completion',
  CLEARING: 'clearing', // mundur keluar bay
  TO_EXIT: 'toExit',
  EXITED: 'exited',
};

export class Truck {
  constructor({ id, product, requestedVolume, arrivalTime }) {
    this.id = id;
    this.label = `TT-${String(id).padStart(3, '0')}`;
    this.product = product;
    this.requestedVolume = requestedVolume;
    this.loadedVolume = 0;
    this.state = TRUCK_STATES.HOLDING;
    this.bay = null; // nomor bay
    this.stall = null; // indeks stall
    this.spawned = false; // sudah memiliki posisi fisik
    this.route = null;
    this.routeIndex = 0;
    this.s = 0;
    this.speed = 0;
    this.pose = null;
    this.footprint = null;
    this.fpoly = null;
    this.fbb = null;
    this.acq = null; // { tail, head } rentang indeks segmen yang diklaim
    this.routeEndOffset = 0;
    this.blocked = false;
    this.requestSince = null;
    this.moving = false;
    this.lastHeading = null;
    this.timestamps = {
      arrival: arrivalTime,
      facilityEntry: null,
      queueEntry: null,
      dispatch: null,
      bayArrival: null,
      loadingStart: null,
      loadingEnd: null,
      bayClear: null,
      exit: null,
    };
    this.snapshot = null; // parameter servis saat dispatch
    this.passedCount = 0; // berapa kali truk yang datang kemudian dipanggil lebih dulu
    this.protected = false;
    this.protectEvent = null;
    this.exitedAfterHorizon = false;
  }

  get travelling() {
    return this.spawned && !!this.route && !this.atRouteEnd;
  }

  get currentSegment() {
    return this.route ? this.route.segments[this.routeIndex] : null;
  }
}
