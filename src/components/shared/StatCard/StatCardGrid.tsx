'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Box, SxProps, Theme } from '@mui/material';

export interface StatCardGridProps {
    children: React.ReactNode;
    /** Number of columns or responsive column breakpoint map */
    columns?: number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
    /** Spacing between cards in MUI spacing units (defaults to { xs: 1.25, sm: 1.75, md: 2 }) */
    gap?: number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
    /** Additional MUI sx styles */
    sx?: SxProps<Theme>;
}

/**
 * StatCardGrid — Unified responsive grid layout wrapper for StatCards.
 *
 * Ensures consistent grid columns, breakpoints, and gaps across all modules
 * (Purchase Orders, Sell Orders, Jobs, Expenses, etc.).
 *
 * Responsive defaults:
 * - xs (mobile): 2 columns
 * - sm (tablet): 3 columns
 * - md (desktop): dynamically adapts to child count (up to 7) or custom column count
 */
export const StatCardGrid: React.FC<StatCardGridProps> = ({
    children,
    columns,
    gap = { xs: 1.25, sm: 1.75, md: 2 },
    sx,
}) => {
    const validChildren = React.Children.toArray(children).filter(Boolean);
    const childCount = validChildren.length;

    const xsCols = typeof columns === 'number' ? columns : columns?.xs ?? 2;
    const smCols = typeof columns === 'number' ? columns : columns?.sm ?? Math.min(childCount, 3);
    const mdCols = typeof columns === 'number' ? columns : columns?.md ?? Math.min(childCount, 7);
    const lgCols = typeof columns === 'object' && columns?.lg ? columns.lg : undefined;
    const xlCols = typeof columns === 'object' && columns?.xl ? columns.xl : undefined;

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: {
                    xs: `repeat(${xsCols}, minmax(0, 1fr))`,
                    sm: `repeat(${smCols}, minmax(0, 1fr))`,
                    md: `repeat(${mdCols}, minmax(0, 1fr))`,
                    ...(lgCols ? { lg: `repeat(${lgCols}, minmax(0, 1fr))` } : {}),
                    ...(xlCols ? { xl: `repeat(${xlCols}, minmax(0, 1fr))` } : {}),
                },
                gap,
                ...sx,
            }}
        >
            {children}
        </Box>
    );
};

export default StatCardGrid;
