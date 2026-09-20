/* profile-menu.ts
 *
 * The avatar button and its dropdown, forked from ilc-members-manager. Same
 * behaviour — avatar from the auth photo, or a coloured initial derived from
 * the email — with the member-profile switching removed: there is one account
 * here, and what it can do is decided by its ACL document.
 *
 * It also holds the appearance picker: the site's themes, with the active one
 * marked. Picking one deliberately leaves the menu open, so several can be
 * compared against the page behind it without reopening the menu each time.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FirebaseStateService } from '../firebase-state.service';
import { IconComponent } from '../icons/icon.component';
import { EditModeService } from '../edit-mode/edit-mode.service';
import { ThemeService } from '../theme/theme.service';
import { Theme } from '../theme/theme';

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
  protected editMode = inject(EditModeService);
  protected themes = inject(ThemeService);

  protected user = this.firebaseState.user;
  protected isAdmin = this.firebaseState.isAdmin;
  protected menuOpen = signal(false);

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

  protected selectTheme(theme: Theme) {
    this.themes.select(theme);
  }

  protected toggleEditMode() {
    this.menuOpen.set(false);
    this.editMode.toggle();
  }

  protected toggleMenu() {
    this.menuOpen.set(!this.menuOpen());
  }

  protected logout() {
    this.menuOpen.set(false);
    this.firebaseState.logout();
  }
}
