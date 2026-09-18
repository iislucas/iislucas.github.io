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
