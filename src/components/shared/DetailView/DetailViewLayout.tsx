'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Box, Grid, Alert, Button, Skeleton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { DetailViewBanner } from './DetailViewBanner';


export interface DetailViewLayoutProps {
    sidebar: React.ReactNode;
    metricStrip?: React.ReactNode;
    children: React.ReactNode;
    isLoading?: boolean;
    isError?: boolean;
    errorMessage?: string;
    onBack?: () => void;
    onEdit?: () => void;
    onPrint?: () => void;
    enableShortcuts?: boolean;
    backLabel?: string;
    headerTitle?: string;
    headerSubtitle?: string;
    headerBadge?: React.ReactNode;
    headerActions?: React.ReactNode;
    banner?: React.ReactNode;
    sidebarGridSize?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
    mainGridSize?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
}

export const DetailViewLayout: React.FC<DetailViewLayoutProps> = ({
    sidebar,
    metricStrip,
    children,
    isLoading,
    isError,
    errorMessage,
    onBack,
    onEdit,
    onPrint,
    enableShortcuts = true,
    backLabel = 'Back to List',
    headerTitle,
    headerSubtitle,
    headerBadge,
    headerActions,
    banner,
    sidebarGridSize,
    mainGridSize
}) => {
    const resolvedSidebarSize = sidebarGridSize || { xs: 12, md: 3.2, lg: 2.75 };
    const resolvedMainSize = mainGridSize || { xs: 12, md: 8.8, lg: 9.25 };

    // Shortcuts disabled for Factoonemini
    if (isLoading) {
        return (
            <Box sx={{ pb: 4 }}>
                <Grid container spacing={2.5} sx={{ minHeight: 'calc(100vh - 200px)', alignItems: 'stretch' }}>
                    {/* Left Sidebar Skeleton */}
                    <Grid size={resolvedSidebarSize}>
                        <Skeleton
                            variant="rectangular"
                            height="100%"
                            sx={{ minHeight: 500, borderRadius: '16px' }}
                        />
                    </Grid>
                    {/* Right Main Content Skeleton with top banner skeleton */}
                    <Grid size={resolvedMainSize} sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Skeleton
                            variant="rectangular"
                            height={64}
                            sx={{ mb: 2.5, borderRadius: '14px' }}
                        />
                        <Skeleton
                            variant="rectangular"
                            height={88}
                            sx={{ mb: 2.5, borderRadius: '14px' }}
                        />
                        <Skeleton
                            variant="rectangular"
                            sx={{ flex: 1, minHeight: 400, borderRadius: '14px' }}
                        />
                    </Grid>
                </Grid>
            </Box>
        );
    }

    if (isError) {
        return (
            <Box sx={{ p: 3 }}>
                {onBack && (
                    <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
                        {backLabel}
                    </Button>
                )}
                <Alert severity="error">{errorMessage || 'Failed to load details'}</Alert>
            </Box>
        );
    }

    // Determine banner element (placed strictly on top of the right main content area)
    const bannerElement = banner !== undefined
        ? banner
        : (headerActions || headerTitle || headerSubtitle || headerBadge)
            ? (
                <DetailViewBanner
                    title={headerTitle || ''}
                    subtitle={headerSubtitle}
                    badge={headerBadge}
                    actions={headerActions}
                />
            )
            : null;

    return (
        <Box sx={{ minHeight: { md: 'calc(100vh - 165px)' }, pb: { xs: 3, md: 1 } }}>
            <Grid
                container
                spacing={2.5}
                sx={{
                    alignItems: 'stretch',
                    minHeight: { md: 'calc(100vh - 165px)' },
                    height: { md: 'calc(100vh - 165px)' }
                }}
            >
                {/* Left Hero Sidebar Panel */}
                <Grid
                    size={resolvedSidebarSize}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: { md: '100%' }
                    }}
                >
                    {sidebar}
                </Grid>

                {/* Right Main Content Area */}
                <Grid
                    size={resolvedMainSize}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: { md: '100%' },
                        minHeight: 0,
                        flexGrow: 1
                    }}
                >
                    {bannerElement && (
                        <Box sx={{ flexShrink: 0 }}>
                            {bannerElement}
                        </Box>
                    )}
                    {metricStrip && (
                        <Box sx={{ flexShrink: 0 }}>
                            {metricStrip}
                        </Box>
                    )}
                    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {children}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};


