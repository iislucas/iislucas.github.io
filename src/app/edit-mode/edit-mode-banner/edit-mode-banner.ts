/* edit-mode-banner.ts
 *
 * The strip pinned under the header while edit mode is on: it says that the
 * page is editable, offers to undo the most recent change of any kind, and
 * is where edit mode is switched off again.
 */

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditModeService } from '../edit-mode.service';
import { IconComponent } from '../../icons/icon.component';

@Component({
  selector: 'app-edit-mode-banner',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './edit-mode-banner.html',
  styleUrl: './edit-mode-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditModeBannerComponent {
  protected editMode = inject(EditModeService);
}
