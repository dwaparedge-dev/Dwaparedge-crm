/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 
/**
 * StatCard — Unified reusable statistics card component.
 *
 * Displays a single metric with a top gradient accent bar, a prominent value,
 * a descriptive label, and an icon. Designed to replace all inline stat cards
 * and local StatCard variants across the application.
 *
 * @example
 * <StatCard
 *   value={42}
 *   label="Total Machines"
 *   icon={<PrecisionManufacturingIcon />}
 *   accentColor={ACCENT_INDIGO}
 *   onClick={() => handleCardClick('totalMachines')}
 *   tooltip="Click to view all machines"
 * />
 */

'use client';

import React from 'react';
import {
    Card,
    Box,
    Typography,
    Tooltip,
    Skeleton,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

// ============================================
// ACCENT COLOR PRESETS
// ============================================

/** Indigo to Purple — use for total/primary counts */
export const ACCENT_INDIGO = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

/** Teal to Emerald — use for active/working/success metrics */
export const ACCENT_EMERALD = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';

/** Coral to Red — use for error/fault/low-stock alerts */
export const ACCENT_CORAL = 'linear-gradient(135deg, #f5576c 0%, #ff6b6b 100%)';

/** Gold to Orange — use for warning/pending states */
export const ACCENT_AMBER = 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)';

/** Sky Blue to Cyan — use for info/secondary metrics */
export const ACCENT_CYAN = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';

/** Lavender to Pink — use for category/type breakdowns */
export const ACCENT_VIOLET = 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)';

/** Deep Teal to Light Blue — use for averages/time metrics */
export const ACCENT_OCEAN = 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)';

/** Rose to Blush — use for cost/financial metrics */
export const ACCENT_SUNSET = 'linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)';

/** Vivid Orange to Deep Orange — use for highlighting */
export const ACCENT_ORANGE = 'linear-gradient(135deg, #FF9966 0%, #FF5E62 100%)';

/** Violet to Deep Purple — use for dispatched / amended / special operations */
export const ACCENT_PURPLE = 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)';

// ============================================
// COMPONENT INTERFACE
// ============================================

export interface StatCardProps {
    /** The main numeric or text value displayed prominently */
    value: string | number;
    /** Label text below the value (primary prop name) */
    label?: string;
    /** Alias for label (legacy prop name) */
    title?: string;
    /** Icon to display in the icon box. Can be a React element <Icon /> or a component reference Icon. */
    icon: React.ReactNode | React.ElementType;
    /** Gradient or solid color for the top accent bar (4px strip). Defaults to ACCENT_INDIGO. */
    accentColor?: string;
    /** Tooltip text shown on hover */
    tooltip?: string;
    /** Click handler — makes card interactive with pointer cursor + hover lift */
    onClick?: () => void;
    /** Whether data is still loading (shows skeleton placeholder) */
    isLoading?: boolean;
    /** Override color for the value text (e.g. error.main for fault counts) */
    valueColor?: string;
    /** Color for the icon and its tinted background. Falls back to theme primary. */
    iconColor?: string;
    /** Optional subtitle text shown under the main value */
    subtitle?: string;
    /** Whether this stat card is currently selected/active as a filter */
    isSelected?: boolean;
    /** Whether this stat card should be visually dimmed because another card is selected */
    isDimmed?: boolean;
    /** Optional custom badge text shown when selected (defaults to 'Active') */
    activeBadge?: string;
}

// ============================================
// COMPONENT
// ============================================

/**
 * A unified statistics card with a top gradient accent bar.
 * Replaces all inline stat cards and local StatCard variants across the app.
 *
 * (CRM tweak: tighter padding and smaller value/icon than FactoONE's original.)
 * Layout: Value + Label on the left, Icon box on the right.
 * Accent bar: 4px gradient strip at the top of the card.
 *
 * @param props - StatCardProps
 * @returns Rendered stat card element
 */
export function StatCard({
    value,
    label,
    title,
    icon,
    accentColor = ACCENT_INDIGO,
    tooltip,
    onClick,
    isLoading = false,
    valueColor,
    iconColor,
    subtitle,
    isSelected = false,
    isDimmed = false,
    activeBadge,
}: StatCardProps) {
    const theme = useTheme();
    const resolvedIconColor = iconColor || theme.palette.primary.main;

    const cardContent = (
        <Card
            onClick={onClick}
            sx={{
                position: 'relative',
                overflow: 'hidden',
                // Deep Slate Hero Inversion when selected:
                background: isSelected
                    ? 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%) !important'
                    : (theme.palette.mode === 'dark'
                        ? alpha(theme.palette.background.paper, 0.7)
                        : '#FFFFFF'),
                p: { xs: 1.5, sm: 1.75, md: 2 }, pt: { xs: 2, sm: 2.25, md: 2.5 },
                borderRadius: '14px',
                // Spotlight Ambient Neon Glow when selected:
                boxShadow: isSelected
                    ? `0 16px 36px -4px rgba(15, 23, 42, 0.5), 0 0 24px -2px ${alpha(resolvedIconColor, 0.45)}`
                    : (theme.palette.mode === 'dark'
                        ? '0 4px 20px rgba(0,0,0,0.35)'
                        : '0 6px 24px rgba(15, 23, 42, 0.06)'),
                border: isSelected
                    ? `1.5px solid ${alpha(resolvedIconColor, 0.85)}`
                    : (theme.palette.mode === 'dark'
                        ? `1px solid ${alpha(theme.palette.divider, 0.15)}`
                        : '1px solid rgba(226, 232, 240, 0.9)'),
                transform: isSelected ? 'translateY(-4px)' : 'none',
                // Spotlight Dimming for non-selected cards when another card is active:
                opacity: isDimmed ? 0.55 : 1,
                filter: isDimmed ? 'grayscale(20%)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: onClick ? 'pointer' : 'default',

                /* Top accent bar via pseudo-element */
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: isSelected ? 5 : 4,
                    background: accentColor,
                    borderTopLeftRadius: 'inherit',
                    borderTopRightRadius: 'inherit',
                    boxShadow: isSelected ? `0 2px 12px ${alpha(resolvedIconColor, 0.7)}` : 'none',
                },

                /* Hover effects — only when clickable */
                ...(onClick && {
                    '&:hover': {
                        opacity: 1,
                        filter: 'none',
                        transform: isSelected ? 'translateY(-5px)' : 'translateY(-3px)',
                        boxShadow: isSelected
                            ? `0 20px 42px -4px rgba(15, 23, 42, 0.6), 0 0 32px 0px ${alpha(resolvedIconColor, 0.6)}`
                            : (theme.palette.mode === 'dark'
                                ? '0 8px 24px rgba(0,0,0,0.45)'
                                : '0 12px 30px rgba(15, 23, 42, 0.12)'),
                    },
                }),
            }}
        >
            {/* Active glassmorphism indicator pill */}
            {isSelected && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: { xs: 6, md: 10 },
                        right: { xs: 8, md: 12 },
                        px: { xs: 0.8, md: 1.1 },
                        py: { xs: 0.15, md: 0.3 },
                        borderRadius: '999px',
                        fontSize: { xs: '0.55rem', md: '0.625rem' },
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                        color: '#FFFFFF',
                        border: `1px solid ${alpha(resolvedIconColor, 0.6)}`,
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.6,
                        zIndex: 2,
                        boxShadow: `0 0 10px ${alpha(resolvedIconColor, 0.4)}`,
                    }}
                >
                    <Box
                        sx={{
                            width: { xs: 5, md: 6 },
                            height: { xs: 5, md: 6 },
                            borderRadius: '50%',
                            backgroundColor: resolvedIconColor,
                            boxShadow: `0 0 8px ${resolvedIconColor}`,
                        }}
                    />
                    {activeBadge && !activeBadge.includes('.') ? activeBadge : 'Active'}
                </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Value + Label */}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    {isLoading ? (
                        <>
                            <Skeleton variant="text" width={100} height={20} sx={{ mb: 0.5 }} />
                            <Skeleton variant="text" width={70} height={36} />
                        </>
                    ) : (
                        <>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: isSelected
                                        ? '#FFFFFF !important'
                                        : (theme.palette.mode === 'dark' ? '#cbd5e1' : '#475569'),
                                    fontWeight: 700,
                                    fontSize: { xs: '0.75rem', sm: '0.8rem', md: '0.85rem' },
                                    letterSpacing: '0.01em',
                                    lineHeight: 1.3,
                                    mb: 0.25,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {label || title}
                            </Typography>
                            <Typography
                                variant="h4"
                                sx={{
                                    fontWeight: 800,
                                    color: isSelected
                                        ? '#FFFFFF !important'
                                        : (valueColor || theme.palette.text.primary),
                                    lineHeight: 1.2,
                                    fontSize: {
                                        xs: String(value).length > 14 ? '1.05rem' : String(value).length > 10 ? '1.2rem' : '1.35rem',
                                        sm: String(value).length > 14 ? '1.15rem' : String(value).length > 10 ? '1.35rem' : '1.55rem',
                                        md: String(value).length > 14 ? '1.15rem' : String(value).length > 10 ? '1.3rem' : '1.5rem',
                                    },
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {value}
                            </Typography>
                            {subtitle && !isLoading && (
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: isSelected
                                            ? 'rgba(255, 255, 255, 0.6) !important'
                                            : theme.palette.text.disabled,
                                        display: 'block',
                                        mt: 0.25,
                                        fontSize: { xs: '0.7rem', md: '0.75rem' },
                                    }}
                                >
                                    {subtitle}
                                </Typography>
                            )}
                        </>
                    )}
                </Box>

                {/* Icon Box */}
                <Box
                    sx={{
                        width: { xs: 34, sm: 38, md: 42 },
                        height: { xs: 34, sm: 38, md: 42 },
                        borderRadius: { xs: '10px', sm: '12px', md: '15px' },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        ml: { xs: 1, md: 2 },
                        backgroundColor: isSelected
                            ? alpha(resolvedIconColor, 0.25)
                            : alpha(resolvedIconColor, 0.1),
                        color: isSelected ? '#FFFFFF' : resolvedIconColor,
                        border: isSelected
                            ? `1px solid ${alpha(resolvedIconColor, 0.55)}`
                            : 'none',
                        boxShadow: isSelected
                            ? `0 0 16px ${alpha(resolvedIconColor, 0.4)}`
                            : 'none',
                        transition: 'all 0.3s ease',
                        '& .MuiSvgIcon-root': {
                            fontSize: { xs: 18, sm: 21, md: 24 },
                        },
                    }}
                >
                    {React.isValidElement(icon) ? (
                        icon
                    ) : (
                        React.createElement(icon as React.ElementType)
                    )}
                </Box>
            </Box>
        </Card>
    );

    /* Wrap in Tooltip only when tooltip text is provided */
    if (tooltip) {
        return (
            <Tooltip title={tooltip} arrow placement="top">
                {cardContent}
            </Tooltip>
        );
    }

    return cardContent;
}

export default StatCard;
