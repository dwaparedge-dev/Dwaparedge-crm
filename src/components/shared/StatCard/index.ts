/**
 * StatCard — Barrel exports for the unified statistics card component.
 *
 * Provides the StatCard component, its props interface, and all accent
 * color gradient presets used across the application for visual differentiation.
 */

export {
    StatCard,
    default,

    /* Accent Color Presets */
    ACCENT_INDIGO,
    ACCENT_EMERALD,
    ACCENT_CORAL,
    ACCENT_AMBER,
    ACCENT_CYAN,
    ACCENT_VIOLET,
    ACCENT_OCEAN,
    ACCENT_SUNSET,
    ACCENT_ORANGE,
    ACCENT_PURPLE,
} from './StatCard';

export { StatCardGrid } from './StatCardGrid';
export type { StatCardProps } from './StatCard';
export type { StatCardGridProps } from './StatCardGrid';
