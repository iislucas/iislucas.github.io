/* footer.ts
 *
 * The site footer: the copyright line and a couple of links.
 *
 * Sharing and the build stamp both used to live here. Sharing moved to the
 * nav bar, beside the avatar, because sharing the page you are reading should
 * not mean scrolling to the end of it. The stamp moved to the app shell,
 * where it floats in the corner as it does in ilc-members-manager.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../content.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  private content = inject(ContentService);

  protected year = new Date().getFullYear();
  protected name = computed(() => this.content.profile().name || 'Lucas Dixon');
}
