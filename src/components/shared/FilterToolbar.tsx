'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Box, Card, useTheme, alpha, SxProps, Theme } from '@mui/material';

export interface FilterToolbarProps {
    /** Optional left-hand filter controls (e.g. dropdowns) */
    leftFilters?: React.ReactNode;
    /** Optional search input (placed right-aligned) */
    search?: React.ReactNode;
    /** Optional extra right actions (e.g. AdvancedFilters button) */
    rightActions?: React.ReactNode;
    /** Standard children override */
    children?: React.ReactNode;
    /** Custom container SX overrides */
    sx?: SxProps<Theme>;
}

/**
 * Standardized Filter Toolbar Container for FactoONE.
 * Enforces uniform padding (16px), 12px border-radius, clean dividers,
 * and standard 38px fixed height for all inner filter controls.
 */
export const FilterToolbar: React.FC<FilterToolbarProps> = ({
    leftFilters,
    search,
    rightActions,
    children,
    sx = {},
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Card
            elevation={0}
            sx={{
                p: { xs: 1.25, sm: 1.75 },
                borderRadius: '12px',
                bgcolor: isDark ? alpha(theme.palette.background.paper, 0.8) : '#ffffff',
                border: isDark
                    ? `1px solid ${alpha(theme.palette.divider, 0.15)}`
                    : '1px solid rgba(226, 232, 240, 0.9)',
                boxShadow: isDark
                    ? '0 4px 20px rgba(0,0,0,0.35)'
                    : '0 4px 18px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: { xs: 1.25, md: 2 },
                '& .MuiInputBase-root': {
                    height: 38,
                    fontSize: '0.84rem',
                },
                '& .MuiButton-root': {
                    height: 38,
                    textTransform: 'none',
                    fontWeight: 600,
                },
                ...sx,
            }}
        >
            {children ? (
                children
            ) : (
                <>
                    {/* Left filters: On desktop stays on the left (order: 1). On mobile moves to row 2 (order: 2) */}
                    {leftFilters && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.25,
                                flexWrap: 'wrap',
                                order: { xs: 2, md: 1 },
                                width: { xs: '100%', md: 'auto' },
                                flex: { xs: '1 1 100%', md: '0 1 auto' },
                            }}
                        >
                            {leftFilters}
                        </Box>
                    )}

                    <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'block' }, order: 2 }} />

                    {/* Search & Actions: On desktop stays on the right (order: 3). On mobile moves to row 1 (order: 1) */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            order: { xs: 1, md: 3 },
                            width: { xs: '100%', md: 'auto' },
                            flex: { xs: '1 1 100%', md: '0 1 auto' },
                            justifyContent: { xs: 'stretch', md: 'flex-end' },
                        }}
                    >
                        {search}
                        {rightActions}
                    </Box>
                </>
            )}
        </Card>
    );
};

export default FilterToolbar;
