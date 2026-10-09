'use client';

/**
 * TableRowSkeleton
 * Renders N animated shimmer TableRow items with TableCell skeletons
 * directly inside an existing MUI TableBody component.
 */

import React from 'react';
import { TableRow, TableCell, Skeleton } from '@mui/material';

export interface TableRowSkeletonProps {
    /** Number of rows to render (default 5) */
    rowCount?: number;
    /** Number of columns per row (default 5) */
    columnCount?: number;
    /** Array of custom width percentages/pixel values for each column */
    columnWidths?: (string | number)[];
    /** Row height in pixels (default 52) */
    rowHeight?: number;
}

export const TableRowSkeleton: React.FC<TableRowSkeletonProps> = ({
    rowCount = 5,
    columnCount = 5,
    columnWidths,
    rowHeight = 52,
}) => {
    return (
        <>
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
                <TableRow key={rowIdx} sx={{ height: rowHeight }}>
                    {Array.from({ length: columnCount }).map((_, colIdx) => {
                        const customWidth = columnWidths && columnWidths[colIdx];
                        const defaultWidth = colIdx === 0 ? '45%' : colIdx === columnCount - 1 ? '35%' : '70%';

                        return (
                            <TableCell key={colIdx}>
                                <Skeleton
                                    variant="text"
                                    width={customWidth || defaultWidth}
                                    height={22}
                                    animation="wave"
                                    sx={{ borderRadius: '4px' }}
                                />
                            </TableCell>
                        );
                    })}
                </TableRow>
            ))}
        </>
    );
};

export default TableRowSkeleton;
