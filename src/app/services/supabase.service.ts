import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private client: SupabaseClient | null = null;

  get isConfigured(): boolean {
    return !!environment.supabaseUrl
      && !!environment.supabaseAnonKey
      && environment.supabaseUrl !== 'https://your-project.supabase.co'
      && environment.supabaseAnonKey !== 'your-publishable-key';
  }

  get connectionStatus(): string {
    return this.isConfigured ? 'Connesso a Supabase' : 'Configurazione mancante: inserisci URL e anon key nelle environment';
  }

  getClient(): SupabaseClient | null {
    if (!this.isConfigured) {
      return null;
    }

    if (!this.client) {
      this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }

    return this.client;
  }
}
