// Model bay dan mesin statusnya.
export const BAY_STATES = {
  INACTIVE: 'inactive',
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  PREP: 'prep',
  LOADING: 'loading',
  COMPLETION: 'completion',
  CLEARING: 'clearing',
};

export class Bay {
  constructor(layoutBay) {
    this.number = layoutBay.number;
    this.index = layoutBay.index;
    this.products = [...layoutBay.products];
    this.pendingProducts = null; // edit produk yang ditunda sampai penugasan saat ini selesai
    this.active = layoutBay.active;
    this.pendingDeactivation = false;
    this.state = layoutBay.active ? BAY_STATES.AVAILABLE : BAY_STATES.INACTIVE;
    this.truckId = null;
    this.reservedAt = null;
    this.committedTotal = 0; // detik: total waktu komitmen yang telah selesai (untuk prioritas dispatch)
    this.serviceCount = 0;
    // Akumulasi statistik
    this.stats = { activeTime: 0, committedTime: 0, loadingTime: 0, lastAccrual: 0 };
  }

  get committed() {
    return this.state !== BAY_STATES.AVAILABLE && this.state !== BAY_STATES.INACTIVE;
  }

  get isActive() {
    return this.active || this.pendingDeactivation;
  }

  // Label status untuk tampilan: 'pendingDeactivation' menimpa status servis.
  get displayState() {
    return this.pendingDeactivation ? 'pendingDeactivation' : this.state;
  }

  accrue(now) {
    const dt = now - this.stats.lastAccrual;
    if (dt > 0) {
      if (this.isActive) this.stats.activeTime += dt;
      if (this.committed) this.stats.committedTime += dt;
      if (this.state === BAY_STATES.LOADING) this.stats.loadingTime += dt;
    }
    this.stats.lastAccrual = now;
  }
}
