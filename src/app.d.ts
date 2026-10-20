// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: { id: number; username: string; displayName: string; isAdmin: boolean } | null;
    }
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
