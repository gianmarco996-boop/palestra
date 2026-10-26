import { Injectable, computed, signal } from '@angular/core';

interface PersistedTimer {
  durationSeconds: number;
}

const TIMER_STORAGE_KEY = 'gym-tracker.rest-timer.v1';

@Injectable({
  providedIn: 'root',
})
export class RestTimerService {
  private readonly duration = signal(90);
  private readonly endsAt = signal<number | null>(null);
  private readonly remaining = signal(90);

  readonly durationSeconds = this.duration.asReadonly();
  readonly isRunning = computed(() => this.endsAt() !== null);
  readonly remainingSeconds = this.remaining.asReadonly();
  readonly display = computed(() => {
    const seconds = Math.max(0, this.remaining());
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });

  constructor() {
    const persisted = localStorage.getItem(TIMER_STORAGE_KEY);
    if (persisted) {
      const state = JSON.parse(persisted) as PersistedTimer;
      if (Number.isFinite(state.durationSeconds) && state.durationSeconds > 0) {
        this.duration.set(Math.floor(state.durationSeconds));
        this.remaining.set(Math.floor(state.durationSeconds));
      }
    }

    window.setInterval(() => this.update(), 250);
  }

  start(): void {
    const now = Date.now();
    const seconds = this.duration();
    this.endsAt.set(now + seconds * 1000);
    this.remaining.set(seconds);
    this.persist();
  }

  stop(): void {
    this.endsAt.set(null);
    this.remaining.set(this.duration());
    this.persist();
  }

  setDuration(value: number | string | null | undefined): void {
    const duration = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(duration)) {
      return;
    }

    const seconds = Math.min(7200, Math.max(1, Math.floor(duration)));
    this.duration.set(seconds);
    if (!this.isRunning()) {
      this.remaining.set(seconds);
    }
    this.persist();
  }

  addSeconds(seconds: number): void {
    if (this.endsAt() !== null) {
      const updatedEnd = Math.max(Date.now(), this.endsAt()!) + seconds * 1000;
      this.endsAt.set(updatedEnd);
      this.update();
    } else {
      this.setDuration(this.duration() + seconds);
      this.remaining.set(this.duration());
    }
    this.persist();
  }

  private update(): void {
    const end = this.endsAt();
    if (end === null) {
      return;
    }

    const secondsLeft = Math.ceil((end - Date.now()) / 1000);
    if (secondsLeft <= 0) {
      this.endsAt.set(null);
      this.remaining.set(0);
      this.persist();
    } else {
      this.remaining.set(secondsLeft);
    }
  }

  private persist(): void {
    const state: PersistedTimer = {
      durationSeconds: this.duration(),
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  }
}
