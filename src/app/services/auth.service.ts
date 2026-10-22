import { inject, Injectable } from '@angular/core';
import { UserProfile } from '../models/workout.model';
import { SupabaseService } from './supabase.service';
import { WorkoutDataService } from './workout-data.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly workoutData = inject(WorkoutDataService);
  public user: UserProfile | null = null;
  public isAuthenticated = false;
  public authMessage = 'Accesso demo locale';

  constructor() {
    void this.restoreSession().catch((error: unknown) => {
      this.authMessage = error instanceof Error ? error.message : 'Impossibile ripristinare la sessione.';
    });
  }

  async restoreSession(): Promise<void> {
    const client = this.supabaseService.getClient();

    if (!client) {
      this.workoutData.disconnectUser();
      this.isAuthenticated = true;
      this.user = {
        id: 'demo-user',
        email: 'owner@local.app',
        fullName: 'Proprietario',
      };
      return;
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      this.authMessage = `Errore sessione: ${error.message}`;
      return;
    }

    this.isAuthenticated = !!data.session;
    if (data.session?.user) {
      this.user = {
        id: data.session.user.id,
        email: data.session.user.email ?? 'utente@supabase.local',
        fullName: data.session.user.user_metadata?.['full_name'] ?? 'Utente autenticato',
      };
      this.authMessage = 'Sessione recuperata';
      await this.workoutData.connectUser(data.session.user.id);
    } else {
      this.workoutData.disconnectUser();
    }
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; message: string }> {
    const client = this.supabaseService.getClient();

    if (!client) {
      this.user = {
        id: 'demo-user',
        email,
        fullName: 'Accesso demo',
      };
      this.isAuthenticated = true;
      this.authMessage = 'Demo locale attivo';
      return { success: true, message: 'Accesso demo locale attivo' };
    }

    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message };
    }

    await this.restoreSession();
    return { success: true, message: 'Accesso eseguito' };
  }

  async signOut(): Promise<void> {
    const client = this.supabaseService.getClient();

    if (client) {
      const { error } = await client.auth.signOut();
      if (error) {
        throw error;
      }
    }

    this.user = null;
    this.isAuthenticated = false;
    this.authMessage = 'Disconnesso';
    this.workoutData.disconnectUser();
  }
}
