'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import Box from '@mui/material/Box';
import { SxProps, Theme } from '@mui/material/styles';

export interface AppPageWrapperProps {
    /** Optional Sub-navigation tabs (rendered at top if present) */
    subTabs?: React.ReactNode;
    /** Page Header banner component or custom header node */
    header?: React.ReactNode;
    /** Optional Stat Cards row (rendered below header) */
    stats?: React.ReactNode;
    /** Optional Primary Segmented Tabs row (rendered between stats and filters for 2-layer filtering) */
    primaryTabs?: React.ReactNode;
    /** Optional Filter Toolbar component (rendered below stats/primaryTabs) */
    filters?: React.ReactNode;
    /** Main page content (DataGrid, card grid, detail views, etc.) */
    children?: React.ReactNode;
    /** Custom SX overrides for the outer container */
    sx?: SxProps<Theme>;
}

/**
 * Standardized Page Container Wrapper for FactoONE.
 * Enforces unified horizontal/vertical paddings, background color,
 * vertical section ordering, and clear clearance bounds across all pages.
 */
export const AppPageWrapper: React.FC<AppPageWrapperProps> = ({
    subTabs,
    header,
    stats,
    primaryTabs,
    filters,
    children,
    sx = {},
}) => {
    return (
        <Box
            sx={{
                width: '100%',
                minHeight: '100%',
                px: { xs: 2, sm: 2.5, md: 3 },
                py: 2,
                pb: 4,
                bgcolor: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: 2.5,
                boxSizing: 'border-box',
                overflow: 'visible',
                ...sx,
            }}
        >
            {/* Level 1: Optional Sub-Navigation Tabs */}
            {subTabs && (
                <Box sx={{ width: '100%', mb: 0, overflow: 'visible' }}>
                    {subTabs}
                </Box>
            )}

            {/* Level 2: Hero Header Banner */}
            {header && (
                <Box sx={{ width: '100%', overflow: 'visible' }}>
                    {header}
                </Box>
            )}

            {/* Level 3: Summary Stat Cards Row */}
            {stats && (
                <Box sx={{ width: '100%', overflow: 'visible' }}>
                    {stats}
                </Box>
            )}

            {/* Level 3.5: Optional Primary Segmented Tabs Row */}
            {primaryTabs && (
                <Box sx={{ width: '100%', overflow: 'visible' }}>
                    {primaryTabs}
                </Box>
            )}

            {/* Level 4: Filter Toolbar & Search Bar */}
            {filters && (
                <Box sx={{ width: '100%', overflow: 'visible' }}>
                    {filters}
                </Box>
            )}

            {/* Level 5: Main Content Surface */}
            {children && (
                <Box sx={{ width: '100%', flex: 1, overflow: 'visible' }}>
                    {children}
                </Box>
            )}
        </Box>
    );
};

export default AppPageWrapper;
