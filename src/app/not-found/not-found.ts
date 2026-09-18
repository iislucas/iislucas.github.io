import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IconComponent } from '../icons/icon.component';
import { RoutingService } from '../routing.service';
import { AppPathPatterns, Views } from '../app.config';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private routingService: RoutingService<AppPathPatterns> = inject(RoutingService);

  protected currentPath = computed(() => window.location.pathname);
  protected homeHref = computed(() => this.routingService.hrefForView(Views.Home));
  protected conceptsHref = computed(() => this.routingService.hrefForView(Views.Concepts));

  protected goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.routingService.navigateTo('');
    }
  }
}
