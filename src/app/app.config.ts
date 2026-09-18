/* app.config.ts
 *
 * Route table, dependency-injection tokens and Firebase bootstrap.
 *
 * Routing is the path-pattern system carried over from ilc-members-manager
 * (see routing.utils.ts / routing.service.ts): each view has one pattern, path
 * variables and URL params are typed, and the RoutingService exposes them as
 * signals. There is no Angular Router — the App component switches on the
 * matched pattern id.
 */

import {
  ApplicationConfig,
  InjectionToken,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { environment } from '../environments/environment';
import { addUrlParams, pathPattern, pv } from './routing.utils';
import { RoutingConfig } from './routing.service';

export enum Views {
  Home = 'home',
  Concepts = 'concepts',
  ConceptView = 'conceptView',
  ConceptNew = 'conceptNew',
  ConceptEdit = 'conceptEdit',
  ProfileEdit = 'profileEdit',
  Login = 'login',
}

/**
 * Views an anonymous visitor may open. Everything not listed here needs a
 * signed-in admin; the App component sends other visitors to the login page,
 * and firestore.rules refuses the underlying writes regardless.
 */
export const PUBLIC_VIEWS: ReadonlySet<Views> = new Set([
  Views.Home,
  Views.Concepts,
  Views.ConceptView,
  Views.Login,
]);

/** Views that only an admin may open. Complement of PUBLIC_VIEWS. */
export const ADMIN_VIEWS: ReadonlySet<Views> = new Set([
  Views.ConceptNew,
  Views.ConceptEdit,
  Views.ProfileEdit,
]);

/**
 * The route table.
 *
 * ORDER MATTERS: `matchUrl` returns the FIRST pattern that fits, so a literal
 * path must be declared before any variable pattern of the same shape.
 * `concepts/new` and `concepts/:slug` are both two segments, so ConceptNew is
 * listed first — otherwise `/concepts/new` would be read as the concept whose
 * slug is "new". `RESERVED_SLUGS` keeps a real concept from taking that name.
 */
export const initPathPatterns = {
  [Views.Home]: pathPattern``,
  // `q` is the gallery's free-text filter, `tag` the selected tag. Both are
  // persisted in the URL so a filtered gallery can be linked to and returned to.
  [Views.Concepts]: addUrlParams(pathPattern`concepts`, ['q', 'tag']),
  [Views.ConceptNew]: pathPattern`concepts/new`,
  [Views.ConceptView]: pathPattern`concepts/${pv('slug')}`,
  [Views.ConceptEdit]: pathPattern`concepts/${pv('slug')}/edit`,
  [Views.ProfileEdit]: pathPattern`profile/edit`,
  [Views.Login]: addUrlParams(pathPattern`login`, [{ name: 'returnUrl', ephemeral: true }]),
};

/**
 * Slugs a concept may not use, because a route of the same name would shadow
 * it. Enforced when creating a concept (see concept-edit).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['new', 'edit']);

export type AppPathPatterns = typeof initPathPatterns;
export type PathPatternsIds = keyof typeof initPathPatterns;

export const ROUTING_CONFIG = new InjectionToken<RoutingConfig<AppPathPatterns>>('routing.config');

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('firebase.app');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    {
      provide: ROUTING_CONFIG,
      useValue: { validPathPatterns: initPathPatterns },
    },
    {
      provide: FIREBASE_APP,
      // Eager IIFE: initializeApp registers the default Firebase app at
      // module-load time, which services that call getFirestore()/getAuth()
      // with no argument depend on. Emulator wiring happens here too, before
      // any service can issue a request against the real project.
      useValue: (() => {
        const app = initializeApp(environment.firebase);
        let firestore: ReturnType<typeof getFirestore>;
        try {
          firestore = initializeFirestore(app, {});
        } catch {
          firestore = getFirestore(app);
        }
        if (environment.useEmulator) {
          connectFirestoreEmulator(firestore, 'localhost', 8080);
          connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
          connectStorageEmulator(getStorage(app), 'localhost', 9199);
        }
        return app;
      })(),
    },
  ],
};
