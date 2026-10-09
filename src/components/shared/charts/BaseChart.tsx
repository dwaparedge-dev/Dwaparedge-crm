'use client';

import dynamic from 'next/dynamic';
import { Box, Typography, useTheme, alpha } from '@mui/material';
import ChartSkeleton from '../skeletons/ChartSkeleton';
import { useMemo } from 'react';

import type { ApexOptions } from 'apexcharts';

type ApexAxisChartSeries = { name?: string; data: (number | null)[] | { x: unknown; y: unknown }[] }[];
type ApexNonAxisChartSeries = number[];

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'radialBar' | 'radar' | 'heatmap' | 'treemap' | 'scatter';

interface BaseChartProps {
    id?: string;
    type: ChartType;
    series: ApexAxisChartSeries | ApexNonAxisChartSeries;
    categories?: string[] | number[];
    options?: ApexOptions;
    height?: string | number;
    isLoading?: boolean;
    noData?: boolean;
    title?: string;
    subtitle?: string;
    stacked?: boolean;
}

const BaseChart = ({
    id,
    type,
    series,
    categories,
    options = {},
    height = '100%',
    isLoading = false,
    noData = false,
    stacked = false
}: BaseChartProps) => {
    const theme = useTheme();

    const hasNoData = useMemo(() => {
        if (noData) return true;
        if (!series || !Array.isArray(series) || series.length === 0) return true;

        const firstItem = series[0];
        if (typeof firstItem === 'object' && firstItem !== null && 'data' in firstItem) {
            return (series as ApexAxisChartSeries).every(
                s => !s || !Array.isArray(s.data) || s.data.length === 0 || s.data.every(val => val === null || val === undefined)
            );
        }

        return (series as number[]).every(val => val === 0 || val === null || val === undefined);
    }, [series, noData]);

    const mergedOptions: ApexOptions = useMemo(() => {
        const baseOptions: ApexOptions = {
            ...options,
            chart: {
                ...options.chart,
                id,
                type,
                height,
                stacked,
                toolbar: { show: true, ...(options.chart?.toolbar || {}) },
                sparkline: { enabled: false, ...(options.chart?.sparkline || {}) },
                redrawOnParentResize: true,
                redrawOnWindowResize: true,
            }
        };

        if (categories && categories.length > 0 && options.xaxis?.type !== 'datetime') {
            baseOptions.xaxis = {
                ...(baseOptions.xaxis || {}),
                categories: categories
            };
        }

        return baseOptions;
    }, [type, options, stacked, height, categories, id]);

    if (isLoading) return <ChartSkeleton height={typeof height === 'string' ? 300 : height} variant={type === 'pie' || type === 'donut' ? 'pie' : 'bar'} />;

    if (hasNoData) {
        return (
            <Box sx={{
                height,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.background.paper, 0.4),
                borderRadius: 2,
                border: `1px dashed ${theme.palette.divider}`,
                minHeight: height === '100%' ? 200 : undefined,
                overflow: 'hidden'
            }}>
                <Typography color="text.secondary" variant="body2">
                    No data available for the selected filters
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            width: '100%', 
            height, 
            minHeight: 0, 
            overflow: 'hidden',
            '& .apexcharts-toolbar': {
                display: 'none !important'
            }
        }}>
            <ReactApexChart
                options={mergedOptions}
                series={series}
                type={type}
                height={height}
                width="100%"
            />
        </Box>
    );
};

export default BaseChart;
