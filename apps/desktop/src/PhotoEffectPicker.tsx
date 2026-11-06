import type { PhotoEffect } from '@vyora/shared';
import { photoEffects } from './photo-effects';
import samplePhoto from './assets/booth-friends-color.png';
import './photo-effects.css';

export function PhotoEffectPicker({
  value = 'original',
  disabled = false,
  onChange,
}: {
  value?: PhotoEffect;
  disabled?: boolean;
  onChange: (value: PhotoEffect) => void;
}) {
  return (
    <div className="photo-effects" role="group" aria-label="Photo effect">
      {photoEffects.map((effect) => (
        <button
          key={effect.id}
          type="button"
          disabled={disabled}
          aria-pressed={value === effect.id}
          onClick={() => onChange(effect.id)}
        >
          <span className="photo-effect-thumbnail" aria-hidden="true">
            <img src={samplePhoto} style={{ filter: effect.filter }} alt="" />
            {value === effect.id && (
              <span className="photo-effect-check">✓</span>
            )}
          </span>
          <span>{effect.label}</span>
        </button>
      ))}
    </div>
  );
}
