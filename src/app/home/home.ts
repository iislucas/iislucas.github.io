/* home.ts
 *
 * The landing page: the profile document rendered as markdown, with the
 * concept gallery teased underneath. An admin sees an "Edit" affordance that
 * nobody else does.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../content.service';
import { FirebaseStateService } from '../firebase-state.service';
import { MarkdownViewer } from '../markdown-editor/markdown-viewer';
import { IconComponent } from '../icons/icon.component';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';
import { ConceptCardComponent } from '../concept-card/concept-card';

// How many concepts the landing page previews before sending you to the gallery.
const PREVIEW_COUNT = 3;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MarkdownViewer, IconComponent, ConceptCardComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected content = inject(ContentService);
  protected firebaseState = inject(FirebaseStateService);
  private routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected isAdmin = this.firebaseState.isAdmin;
  protected profile = this.content.profile;
  protected profileLoaded = this.content.profileLoaded;

  protected editHref = computed(() => this.routingService.hrefForView(Views.ProfileEdit));
  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  /** Published concepts only, however the viewer is signed in — the landing
   * page is the public face of the site, so a draft never previews here. */
  protected previewConcepts = computed(() =>
    this.content
      .concepts()
      .filter((c) => c.published)
      .slice(0, PREVIEW_COUNT),
  );

  protected hasMoreConcepts = computed(
    () => this.content.concepts().filter((c) => c.published).length > PREVIEW_COUNT,
  );

  /** True once loaded and genuinely empty — the cue to show setup guidance. */
  protected isUnseeded = computed(
    () => this.profileLoaded() && this.profile().name === '' && this.profile().bioMarkdown === '',
  );
}
