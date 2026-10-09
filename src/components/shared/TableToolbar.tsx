'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import {
    Box,
    IconButton,
    Tooltip,
    ToggleButtonGroup,
    ToggleButton,
    useTheme,
    alpha,
    SxProps,
    Theme,
} from '@mui/material';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded';
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

export interface TableToolbarProps {
    /** Left-hand content (typically SegmentedTabs or status badges) */
    leftContent?: React.ReactNode;
    /** Current view mode (list vs card/grid) */
    viewMode?: 'list' | 'card';
    /** View mode change handler */
    onViewModeChange?: (mode: 'list' | 'card') => void;
    /** Callback to open column customizer */
    onCustomizeColumns?: () => void;
    /** Callback to trigger refresh */
    onRefresh?: () => void;
    /** Whether refresh is currently loading */
    isRefreshing?: boolean;
    /** Extra actions node on the right (alias of rightActions) */
    rightContent?: React.ReactNode;
    /** Extra actions node on the right (alias of rightContent) */
    rightActions?: React.ReactNode;
    /** Custom container SX overrides */
    sx?: SxProps<Theme>;
    /** Children if using simple wrapper mode */
    children?: React.ReactNode;
}

/**
 * Standardized Internal Toolbar for FactoONE Table Cards.
 * Positions status tabs on the left and utility toggles (list/card view,
 * column customizer, refresh) on the right with a clean subtle background tint.
 */
export const TableToolbar: React.FC<TableToolbarProps> = ({
    leftContent,
    viewMode,
    onViewModeChange,
    onCustomizeColumns,
    onRefresh,
    isRefreshing = false,
    rightContent,
    rightActions,
    sx = {},
    children,
}) => {
    const effectiveRightContent = rightContent || rightActions;
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Box
            sx={{
                px: { xs: 2, sm: 2.5 },
                py: 1.5,
                borderBottom: `1px solid ${isDark ? alpha(theme.palette.divider, 0.6) : '#e2e8f0'}`,
                bgcolor: isDark
                    ? alpha(theme.palette.background.paper, 0.4)
                    : 'rgba(248, 250, 252, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
                boxSizing: 'border-box',
                ...sx,
            }}
        >
            {/* Left Content Area (Segmented Tabs / Title / Statuses) */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                    flex: { xs: '1 1 100%', md: '0 1 auto' },
                }}
            >
                {leftContent || children}
            </Box>

            {/* Right Content Area (View Toggles, Customizer, Refresh, Extra) */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    ml: 'auto',
                }}
            >
                {effectiveRightContent}

                {/* View Mode Toggle (List vs Card) */}
                {viewMode && onViewModeChange && (
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={(_, newMode) => newMode && onViewModeChange(newMode)}
                        size="small"
                        sx={{
                            height: 36,
                            p: '3px',
                            gap: '3px',
                            bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : '#f1f5f9',
                            border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.6) : '#e2e8f0'}`,
                            borderRadius: '9px',
                            boxSizing: 'border-box',
                            '& .MuiToggleButtonGroup-grouped': {
                                border: 'none !important',
                                borderRadius: '6px !important',
                                height: '100%',
                                minWidth: 32,
                                px: 1.2,
                                py: 0.3,
                                color: theme.palette.text.secondary,
                                transition: 'all 0.18s ease',
                                '&.Mui-selected': {
                                    bgcolor: isDark
                                        ? `${alpha(theme.palette.primary.main, 0.25)} !important`
                                        : '#ffffff !important',
                                    color: `${isDark ? theme.palette.primary.light : theme.palette.text.primary} !important`,
                                    boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
                                },
                                '&:hover': {
                                    bgcolor: isDark
                                        ? alpha(theme.palette.action.hover, 0.12)
                                        : alpha(theme.palette.action.hover, 0.08),
                                },
                            },
                        }}
                    >
                        <ToggleButton value="list" aria-label="List View">
                            <Tooltip title="List view">
                                <ViewListRoundedIcon sx={{ fontSize: 18 }} />
                            </Tooltip>
                        </ToggleButton>
                        <ToggleButton value="card" aria-label="Card View">
                            <Tooltip title="Card view">
                                <ViewModuleRoundedIcon sx={{ fontSize: 18 }} />
                            </Tooltip>
                        </ToggleButton>
                    </ToggleButtonGroup>
                )}

                {/* Column Customizer Button */}
                {onCustomizeColumns && (
                    <Tooltip title="Customize Columns">
                        <IconButton
                            size="small"
                            onClick={onCustomizeColumns}
                            sx={{
                                width: 36,
                                height: 36,
                                borderRadius: '9px',
                                border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.6) : '#e2e8f0'}`,
                                bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : '#ffffff',
                                color: theme.palette.text.secondary,
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.action.hover, 0.08),
                                    color: theme.palette.text.primary,
                                },
                            }}
                        >
                            <ViewColumnRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                )}

                {/* Refresh Button */}
                {onRefresh && (
                    <Tooltip title="Refresh data">
                        <IconButton
                            size="small"
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            sx={{
                                width: 36,
                                height: 36,
                                borderRadius: '9px',
                                border: `1px solid ${isDark ? alpha(theme.palette.divider, 0.6) : '#e2e8f0'}`,
                                bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : '#ffffff',
                                color: theme.palette.text.secondary,
                                '&:hover': {
                                    bgcolor: alpha(theme.palette.action.hover, 0.08),
                                    color: theme.palette.text.primary,
                                },
                                ...(isRefreshing && {
                                    animation: 'spin 1s linear infinite',
                                    '@keyframes spin': {
                                        '0%': { transform: 'rotate(0deg)' },
                                        '100%': { transform: 'rotate(360deg)' },
                                    },
                                }),
                            }}
                        >
                            <RefreshRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
};

export default TableToolbar;
