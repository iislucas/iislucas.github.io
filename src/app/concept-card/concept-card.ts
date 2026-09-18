/* concept-card.ts
 *
 * One concept as a card in a grid. Used by both the gallery and the landing
 * page teaser, so that a concept looks the same wherever it is listed.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Concept } from '../data-model/concept';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';

@Component({
  selector: 'app-concept-card',
  standalone: true,
  imports: [],
  templateUrl: './concept-card.html',
  styleUrl: './concept-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptCardComponent {
  public concept = input.required<Concept>();
  private routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected href = computed(() =>
    this.routingService.hrefForView(Views.ConceptView, { slug: this.concept().slug }),
  );
}
