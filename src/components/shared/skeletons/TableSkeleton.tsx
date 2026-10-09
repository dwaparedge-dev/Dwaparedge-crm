'use client';

/**
 * TableSkeleton
 * Mimics the layout of CustomDataGrid and standard tabular data surfaces.
 * Supports both standalone card mode and embedded DataGrid overlay mode.
 */

import React from 'react';
import { Box, Skeleton, useTheme, alpha } from '@mui/material';

export interface TableSkeletonProps {
    /** Number of body rows to render (default 6) */
    rowCount?: number;
    /** Number of columns per row (default 5) */
    columnCount?: number;
    /** Show the top column header shimmer (default true) */
    showHeader?: boolean;
    /**
     * Whether this table is standalone (renders card container with border and radius)
     * or embedded inside CustomDataGrid overlay (transparent container with no outer border).
     * Defaults to true.
     */
    standalone?: boolean;
    /** Height of each row in px (default 52) */
    rowHeight?: number;
    /** Optional custom widths per column (e.g. ['20%', '30%', '25%', '25%']) */
    columnWidths?: (string | number)[];
    /** Show bottom pagination bar shimmer (default false) */
    showPagination?: boolean;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
    rowCount = 6,
    columnCount = 5,
    showHeader = true,
    standalone = true,
    rowHeight = 52,
    columnWidths,
    showPagination = false,
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const containerSx = standalone
        ? {
              width: '100%',
              borderRadius: '14px',
              overflow: 'hidden',
              border: isDark
                  ? `1px solid ${alpha(theme.palette.divider, 0.15)}`
                  : '1px solid rgba(226, 232, 240, 0.9)',
              bgcolor: isDark ? alpha(theme.palette.background.paper, 0.7) : '#ffffff',
              boxShadow: isDark
                  ? '0 4px 20px rgba(0,0,0,0.35)'
                  : '0 6px 24px rgba(15, 23, 42, 0.05)',
          }
        : {
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              bgcolor: isDark
                  ? alpha(theme.palette.background.paper, 0.6)
                  : alpha('#ffffff', 0.85),
              backdropFilter: 'blur(4px)',
          };

    return (
        <Box sx={containerSx}>
            {/* Header Row */}
            {showHeader && (
                <Box
                    sx={{
                        display: 'flex',
                        height: 54,
                        alignItems: 'center',
                        px: 2.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: isDark
                            ? alpha(theme.palette.background.default, 0.5)
                            : alpha('#f8fafc', 0.8),
                    }}
                >
                    {Array.from({ length: columnCount }).map((_, i) => {
                        const customWidth = columnWidths && columnWidths[i];
                        const defaultWidth = i === 0 ? '50%' : '65%';

                        return (
                            <Box key={i} sx={{ display: 'flex', flex: 1, alignItems: 'center', px: 1 }}>
                                <Skeleton
                                    variant="text"
                                    width={customWidth || defaultWidth}
                                    height={24}
                                    animation="wave"
                                    sx={{ borderRadius: '4px' }}
                                />
                            </Box>
                        );
                    })}
                </Box>
            )}

            {/* Body Rows */}
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
                <Box
                    key={rowIdx}
                    sx={{
                        display: 'flex',
                        height: rowHeight,
                        alignItems: 'center',
                        px: 2.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:last-child': {
                            borderBottom: showPagination ? '1px solid' : 'none',
                            borderColor: 'divider',
                        },
                        bgcolor: 'transparent',
                    }}
                >
                    {Array.from({ length: columnCount }).map((_, colIdx) => {
                        const customWidth = columnWidths && columnWidths[colIdx];
                        const defaultWidth =
                            colIdx === 0 ? '45%' : colIdx === columnCount - 1 ? '35%' : '75%';

                        return (
                            <Box key={colIdx} sx={{ display: 'flex', flex: 1, alignItems: 'center', px: 1 }}>
                                <Skeleton
                                    variant="text"
                                    width={customWidth || defaultWidth}
                                    height={22}
                                    animation="wave"
                                    sx={{ borderRadius: '4px' }}
                                />
                            </Box>
                        );
                    })}
                </Box>
            ))}

            {/* Optional Pagination Footer Shimmer */}
            {showPagination && (
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        px: 2.5,
                        py: 1.5,
                        height: 52,
                    }}
                >
                    <Skeleton variant="text" width={120} height={20} animation="wave" />
                    <Skeleton variant="rounded" width={220} height={32} animation="wave" sx={{ borderRadius: '8px' }} />
                </Box>
            )}
        </Box>
    );
};

export default TableSkeleton;
