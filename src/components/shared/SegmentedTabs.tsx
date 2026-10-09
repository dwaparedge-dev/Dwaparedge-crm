'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Box, Typography, useTheme, alpha, SxProps, Theme } from '@mui/material';

export interface SegmentedTabItem {
    /** Tab unique value/key */
    value: string | number;
    /** Human-readable tab label */
    label: string;
    /** Optional numeric count or string badge */
    count?: number | string;
    /** Optional start icon */
    icon?: React.ReactNode;
    /** Optional disable flag */
    disabled?: boolean;
}

export interface SegmentedTabsProps {
    /** List of tab items */
    tabs: SegmentedTabItem[];
    /** Currently selected tab value */
    activeTab: string | number;
    /** Tab change handler */
    onChange: (value: any) => void;
    /** Size variant */
    size?: 'small' | 'medium';
    /** Whether container stretches to full width */
    fullWidth?: boolean;
    /** Custom container SX overrides */
    sx?: SxProps<Theme>;
}

/**
 * Standardized Joined Segmented Tabs for FactoONE.
 * Provides a unified, ultra-clean segmented control with item count badges,
 * active contrast highlights, and full dark/light mode responsiveness.
 * Replaces ad-hoc ToggleButtonGroup, chips, and custom box implementations.
 */
export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
    tabs,
    activeTab,
    onChange,
    size = 'medium',
    fullWidth = false,
    sx = {},
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const containerHeight = size === 'small' ? 34 : 42;
    const badgeHeight = size === 'small' ? 18 : 20;
    const fontSize = size === 'small' ? '0.78rem' : '0.84rem';
    const pxPadding = size === 'small' ? 1.75 : 2.5;

    return (
        <Box
            sx={{
                display: fullWidth ? 'flex' : 'inline-flex',
                alignItems: 'center',
                height: containerHeight,
                borderRadius: '10px',
                border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.6) : '#e2e8f0'}`,
                bgcolor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff',
                boxShadow: isDark ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.02)',
                overflow: 'hidden',
                p: '3px',
                gap: '2px',
                boxSizing: 'border-box',
                maxWidth: '100%',
                overflowX: 'auto',
                ...sx,
            }}
        >
            {tabs.map((tab) => {
                const isSelected = String(tab.value) === String(activeTab);

                return (
                    <Box
                        key={String(tab.value)}
                        onClick={() => !tab.disabled && onChange(tab.value)}
                        role="tab"
                        aria-selected={isSelected}
                        tabIndex={tab.disabled ? -1 : 0}
                        onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !tab.disabled) {
                                e.preventDefault();
                                onChange(tab.value);
                            }
                        }}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            px: pxPadding,
                            borderRadius: '7px',
                            cursor: tab.disabled ? 'not-allowed' : 'pointer',
                            opacity: tab.disabled ? 0.5 : 1,
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                            flex: fullWidth ? 1 : 'initial',
                            bgcolor: isSelected
                                ? isDark
                                    ? alpha(theme.palette.text.primary, 0.14)
                                    : '#e2e8f0'
                                : 'transparent',
                            color: isSelected
                                ? theme.palette.text.primary
                                : theme.palette.text.secondary,
                            '&:hover': {
                                bgcolor: isSelected
                                    ? isDark
                                        ? alpha(theme.palette.text.primary, 0.18)
                                        : '#cbd5e1'
                                    : isDark
                                        ? alpha(theme.palette.text.primary, 0.05)
                                        : alpha(theme.palette.action.hover, 0.08),
                                color: theme.palette.text.primary,
                            },
                        }}
                    >
                        {tab.icon && (
                            <Box
                                component="span"
                                sx={{
                                    display: 'inline-flex',
                                    mr: 1,
                                    fontSize: 18,
                                    color: isSelected ? theme.palette.text.primary : 'inherit',
                                }}
                            >
                                {tab.icon}
                            </Box>
                        )}

                        <Typography
                            variant="body2"
                            sx={{
                                fontSize,
                                fontWeight: isSelected ? 800 : 600,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {tab.label}
                        </Typography>

                        {tab.count !== undefined && tab.count !== null && (
                            <Box
                                component="span"
                                sx={{
                                    ml: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: badgeHeight,
                                    height: badgeHeight,
                                    px: 0.75,
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: isSelected ? 800 : 700,
                                    lineHeight: 1,
                                    bgcolor: isSelected
                                        ? isDark
                                            ? alpha(theme.palette.text.primary, 0.22)
                                            : '#cbd5e1'
                                        : isDark
                                            ? alpha(theme.palette.text.primary, 0.08)
                                            : '#f1f5f9',
                                    color: isSelected
                                        ? theme.palette.text.primary
                                        : theme.palette.text.secondary,
                                    transition: 'all 0.18s ease',
                                }}
                            >
                                {tab.count}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
};

export default SegmentedTabs;
