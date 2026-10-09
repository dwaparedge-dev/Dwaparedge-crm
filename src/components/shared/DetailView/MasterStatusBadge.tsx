'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Chip, ChipProps, Tooltip, alpha, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ConstructionIcon from '@mui/icons-material/Construction';

export type MasterStatusType = 
    | 'active' 
    | 'inactive' 
    | 'pending' 
    | 'warning' 
    | 'low_stock' 
    | 'in_stock' 
    | 'maintenance'
    | 'completed'
    | 'depleted'
    | 'info';

interface StatusConfig {
    label: string;
    icon: React.ReactElement;
    tooltip?: string;
    bg: string;
    text: string;
    border: string;
    heroBg: string;
    heroText: string;
    heroBorder: string;
}

const DEFAULT_CONFIGS: Record<MasterStatusType, StatusConfig> = {
    active: {
        label: 'Active',
        icon: <CheckCircleIcon style={{ fontSize: 16 }} />,
        tooltip: 'Record is currently active and operational',
        bg: 'rgba(16, 185, 129, 0.12)',
        text: '#047857',
        border: 'rgba(16, 185, 129, 0.35)',
        heroBg: 'rgba(16, 185, 129, 0.22)',
        heroText: '#a7f3d0',
        heroBorder: 'rgba(16, 185, 129, 0.45)'
    },
    in_stock: {
        label: 'In Stock',
        icon: <CheckCircleIcon style={{ fontSize: 16 }} />,
        tooltip: 'Inventory level is above safety threshold',
        bg: 'rgba(16, 185, 129, 0.12)',
        text: '#047857',
        border: 'rgba(16, 185, 129, 0.35)',
        heroBg: 'rgba(16, 185, 129, 0.22)',
        heroText: '#a7f3d0',
        heroBorder: 'rgba(16, 185, 129, 0.45)'
    },
    completed: {
        label: 'Completed',
        icon: <CheckCircleIcon style={{ fontSize: 16 }} />,
        tooltip: 'Process or order is fully completed',
        bg: 'rgba(16, 185, 129, 0.12)',
        text: '#047857',
        border: 'rgba(16, 185, 129, 0.35)',
        heroBg: 'rgba(16, 185, 129, 0.22)',
        heroText: '#a7f3d0',
        heroBorder: 'rgba(16, 185, 129, 0.45)'
    },
    inactive: {
        label: 'Inactive',
        icon: <CancelIcon style={{ fontSize: 16 }} />,
        tooltip: 'Record is inactive or archived',
        bg: 'rgba(239, 68, 68, 0.12)',
        text: '#b91c1c',
        border: 'rgba(239, 68, 68, 0.35)',
        heroBg: 'rgba(239, 68, 68, 0.22)',
        heroText: '#fca5a5',
        heroBorder: 'rgba(239, 68, 68, 0.45)'
    },
    depleted: {
        label: 'Depleted',
        icon: <CancelIcon style={{ fontSize: 16 }} />,
        tooltip: 'Lot or stock has been fully consumed',
        bg: 'rgba(239, 68, 68, 0.12)',
        text: '#b91c1c',
        border: 'rgba(239, 68, 68, 0.35)',
        heroBg: 'rgba(239, 68, 68, 0.22)',
        heroText: '#fca5a5',
        heroBorder: 'rgba(239, 68, 68, 0.45)'
    },
    pending: {
        label: 'Pending',
        icon: <HourglassEmptyIcon style={{ fontSize: 16 }} />,
        tooltip: 'Awaiting action or confirmation',
        bg: 'rgba(245, 158, 11, 0.12)',
        text: '#b45309',
        border: 'rgba(245, 158, 11, 0.35)',
        heroBg: 'rgba(245, 158, 11, 0.22)',
        heroText: '#fde68a',
        heroBorder: 'rgba(245, 158, 11, 0.45)'
    },
    warning: {
        label: 'Warning',
        icon: <WarningAmberIcon style={{ fontSize: 16 }} />,
        tooltip: 'Attention needed',
        bg: 'rgba(245, 158, 11, 0.12)',
        text: '#b45309',
        border: 'rgba(245, 158, 11, 0.35)',
        heroBg: 'rgba(245, 158, 11, 0.22)',
        heroText: '#fde68a',
        heroBorder: 'rgba(245, 158, 11, 0.45)'
    },
    low_stock: {
        label: 'Low Stock Alert',
        icon: <WarningAmberIcon style={{ fontSize: 16 }} />,
        tooltip: 'Inventory is at or below safety stock level',
        bg: 'rgba(245, 158, 11, 0.12)',
        text: '#b45309',
        border: 'rgba(245, 158, 11, 0.35)',
        heroBg: 'rgba(245, 158, 11, 0.22)',
        heroText: '#fde68a',
        heroBorder: 'rgba(245, 158, 11, 0.45)'
    },
    maintenance: {
        label: 'Under Maintenance',
        icon: <ConstructionIcon style={{ fontSize: 16 }} />,
        tooltip: 'Currently undergoing maintenance / repair',
        bg: 'rgba(168, 85, 247, 0.12)',
        text: '#7e22ce',
        border: 'rgba(168, 85, 247, 0.35)',
        heroBg: 'rgba(168, 85, 247, 0.22)',
        heroText: '#e9d5ff',
        heroBorder: 'rgba(168, 85, 247, 0.45)'
    },
    info: {
        label: 'Info',
        icon: <InfoOutlinedIcon style={{ fontSize: 16 }} />,
        tooltip: 'Informational status',
        bg: 'rgba(14, 165, 233, 0.12)',
        text: '#0369a1',
        border: 'rgba(14, 165, 233, 0.35)',
        heroBg: 'rgba(14, 165, 233, 0.22)',
        heroText: '#bae6fd',
        heroBorder: 'rgba(14, 165, 233, 0.45)'
    }
};

export interface MasterStatusBadgeProps {
    status?: MasterStatusType | string;
    customLabel?: string;
    size?: ChipProps['size'];
    showIcon?: boolean;
    tooltipText?: string;
    variant?: 'default' | 'hero';
}

export const MasterStatusBadge: React.FC<MasterStatusBadgeProps> = ({
    status = 'active',
    customLabel,
    size = 'small',
    showIcon = false,
    tooltipText,
    variant = 'hero'
}) => {
    const theme = useTheme();
    const normalizedKey = (status?.toString().toLowerCase().replace(/[\s-]/g, '_') as MasterStatusType);
    const cfg = DEFAULT_CONFIGS[normalizedKey] || {
        label: customLabel || String(status),
        icon: <InfoOutlinedIcon style={{ fontSize: 16 }} />,
        tooltip: customLabel || String(status),
        bg: 'rgba(99, 102, 241, 0.12)',
        text: '#4338ca',
        border: 'rgba(99, 102, 241, 0.35)',
        heroBg: 'rgba(99, 102, 241, 0.22)',
        heroText: '#c7d2fe',
        heroBorder: 'rgba(99, 102, 241, 0.45)'
    };

    const isDark = theme.palette.mode === 'dark';
    const isHero = variant === 'hero';

    return (
        <Tooltip title={tooltipText ?? cfg.tooltip} arrow>
            <Chip
                label={customLabel || cfg.label}
                size={size}
                icon={showIcon ? cfg.icon : undefined}
                sx={{
                    fontWeight: 800,
                    letterSpacing: '0.2px',
                    borderRadius: '8px',
                    backdropFilter: isHero ? 'blur(10px)' : 'none',
                    bgcolor: isHero ? cfg.heroBg : isDark ? alpha(cfg.text, 0.18) : cfg.bg,
                    color: isHero ? cfg.heroText : isDark ? alpha(cfg.text, 1) : cfg.text,
                    border: `1px solid ${isHero ? cfg.heroBorder : cfg.border}`,
                    boxShadow: isHero ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                    '& .MuiChip-icon': {
                        color: 'inherit'
                    }
                }}
            />
        </Tooltip>
    );
};
