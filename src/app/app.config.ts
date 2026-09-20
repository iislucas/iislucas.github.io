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
  Login = 'login',
}

/**
 * The route table.
 *
 * ORDER MATTERS: `matchUrl` returns the FIRST pattern that fits, so a literal
 * path must be declared before any variable pattern of the same shape.
 *
 * There are no edit pages: an admin edits content in place, in edit mode (see
 * edit-mode/edit-mode.service.ts), so every route here is public.
 */
// Edit mode is a property of the visit rather than of a page, so every route
// carries it: see EDIT_URL_PARAM and edit-mode.service.ts. Keeping it in the
// URL is what lets a reload come back into edit mode rather than dropping out
// of it mid-change.
export const EDIT_URL_PARAM = 'edit';

export const initPathPatterns = {
  [Views.Home]: addUrlParams(pathPattern``, [EDIT_URL_PARAM]),
  // `q` is the gallery's free-text filter, `tag` the selected tag. Both are
  // persisted in the URL so a filtered gallery can be linked to and returned to.
  [Views.Concepts]: addUrlParams(pathPattern`concepts`, ['q', 'tag', EDIT_URL_PARAM]),
  [Views.ConceptView]: addUrlParams(pathPattern`concepts/${pv('slug')}`, [EDIT_URL_PARAM]),
  [Views.Login]: addUrlParams(pathPattern`login`, [
    { name: 'returnUrl', ephemeral: true },
    EDIT_URL_PARAM,
  ]),
};

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
