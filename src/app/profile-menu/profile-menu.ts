/* profile-menu.ts
 *
 * The avatar button and its dropdown, forked from ilc-members-manager. Same
 * behaviour — avatar from the auth photo, or a coloured initial derived from
 * the email — with the member-profile switching removed: there is one account
 * here, and what it can do is decided by its ACL document.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FirebaseStateService } from '../firebase-state.service';
import { IconComponent } from '../icons/icon.component';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';

@Component({
  selector: 'app-profile-menu',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMenuComponent {
  public firebaseState = inject(FirebaseStateService);
  protected routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected Views = Views;
  protected user = this.firebaseState.user;
  protected isAdmin = this.firebaseState.isAdmin;
  protected menuOpen = signal(false);

  protected profileEditHref = computed(() => this.routingService.hrefForView(Views.ProfileEdit));
  protected newConceptHref = computed(() => this.routingService.hrefForView(Views.ConceptNew));

  protected userInitial = computed(() => {
    const user = this.user();
    const source = user?.displayName || user?.email || '';
    return source.charAt(0).toUpperCase();
  });

  /**
   * A stable colour per account, so the fallback avatar is recognisable rather
   * than arbitrary. Same hash as the original — small, deterministic, and it
   * never needs a network round trip.
   */
  protected avatarColor = computed(() => {
    const email = this.user()?.email ?? '';
    if (!email) return '#000000';
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += ('00' + value.toString(16)).slice(-2);
    }
    return color;
  });

  protected toggleMenu() {
    this.menuOpen.set(!this.menuOpen());
  }

  protected logout() {
    this.menuOpen.set(false);
    this.firebaseState.logout();
  }
}
