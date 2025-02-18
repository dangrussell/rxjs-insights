import React, {
  MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DefaultNodeControl,
  duration,
  NodeControl,
  NodeRendererProps,
} from '@app/components/graph';
import { Menu, MenuItem, MenuList, Theme, useTheme } from '@mui/material';
import { useSelectorFunction } from '@app/store';
import {
  targetStateSelector,
  targetUiStateSelector,
  timeSelector,
} from '@app/selectors/insights-selectors';
import {
  getDirection,
  getEventColors,
  getTargetColors,
} from '@app/pages/target-page/subscriber-graph-utils';
import gsap from 'gsap';
import { createSelector, useDispatchCallback } from '@lib/store';
import { subscribersGraphActions } from '@app/actions/subscribers-graph-actions';
import { RelatedTargetHierarchyNode } from '@app/pages/target-page/related-target-hierarchy-node';
import { getRootTargetIdFromKey } from '@app/pages/target-page/get-root-target-id';
import { getLocationStrings } from '@app/utils/get-location-strings';

const circleRadius = 5;
const circleCircumference = 2 * Math.PI * circleRadius;

const vmSelector = (node: RelatedTargetHierarchyNode, theme: Theme) =>
  createSelector(
    [
      targetStateSelector(getRootTargetIdFromKey(node.key)),
      targetUiStateSelector(getRootTargetIdFromKey(node.key)),
      timeSelector,
    ],
    ([targetState, targetUiState, time]) => {
      const { target: rootTarget, relations } = targetState;
      const { expandedKeys } = targetUiState;
      const rootTargetKey = String(rootTarget.id);
      const target = relations.targets[node.target.id];
      const isCaller = target.type === 'caller';
      const targetKey = node.key;
      const event = relations.events[time];
      const location = getLocationStrings(target.locations);
      const isRoot = node.key.startsWith('<') && node.key.endsWith('>');
      const isActive =
        isCaller || (target.startTime <= time && time <= target.endTime);
      const isSelected = event && event.target === target.id;
      const isExpanded = expandedKeys.has(node.key);
      const targetColors = getTargetColors(theme, target);
      const textColor = isRoot ? targetColors.primary : targetColors.secondary;
      const nodeColor = isActive
        ? textColor
        : theme.palette.action.disabledBackground;
      const selectedColor = event && getEventColors(theme, event).secondary;

      return {
        rootTarget,
        rootTargetKey,
        target,
        targetKey,
        event,
        location,
        isRoot,
        isCaller,
        isSelected,
        isExpanded,
        textColor,
        nodeColor,
        selectedColor,
      };
    }
  );

interface MenuState {
  open: boolean;
  position?: {
    top: number;
    left: number;
  };
  focusOptionVisible?: boolean;
  expandOptionVisible?: boolean;
  collapseOptionVisible?: boolean;
  expandAllOptionVisible?: boolean;
  collapseAllOptionVisible?: boolean;
  goToSourceOptionVisible?: boolean;
}

export const SubscriberGraphNodeRenderer = React.forwardRef<
  NodeControl,
  NodeRendererProps<RelatedTargetHierarchyNode>
>(function SubscriberGraphNodeRenderer({ node }, forwardedRef) {
  const elementRef = useRef<SVGGElement | null>(null);
  React.useImperativeHandle(
    forwardedRef,
    () => new DefaultNodeControl(elementRef),
    []
  );
  const theme = useTheme();
  const vm = useSelectorFunction(vmSelector, node.data, theme);

  const circleRef = useRef<SVGCircleElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const [menu, setMenu] = useState<MenuState>({ open: false });
  const onContextMenuOpen = useCallback(
    (event: MouseEvent) => {
      setMenu({
        open: true,
        position: { top: event.clientY, left: event.clientX },
        focusOptionVisible: !vm.isCaller && !vm.isRoot,
        expandOptionVisible: !vm.isCaller && !vm.isExpanded,
        collapseOptionVisible: !vm.isCaller && vm.isExpanded,
        expandAllOptionVisible: !vm.isCaller,
        collapseAllOptionVisible: !vm.isCaller,
        goToSourceOptionVisible: vm.location !== undefined,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [setMenu, vm.isRoot, vm.isExpanded]
  );

  const onContextMenuClose = useCallback(
    (event: MouseEvent) => {
      setMenu({ ...menu, open: false });
      event.preventDefault();
      event.stopPropagation();
    },
    [setMenu, menu]
  );

  const onFocus = useDispatchCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      return subscribersGraphActions.FocusTarget({
        target: vm.target,
        fromKey: vm.rootTargetKey,
        toKey: vm.targetKey,
      });
    },
    [onContextMenuClose, vm.target.id, vm.rootTargetKey, vm.targetKey]
  );

  const onExpand = useDispatchCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      return subscribersGraphActions.Expand({
        target: vm.rootTarget.id,
        key: vm.targetKey,
      });
    },
    [onContextMenuClose, vm.rootTarget.id, vm.targetKey]
  );

  const onExpandAll = useDispatchCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      return subscribersGraphActions.ExpandAll({
        target: vm.rootTarget.id,
        key: vm.targetKey,
      });
    },
    [onContextMenuClose, vm.rootTarget.id, vm.targetKey]
  );

  const onCollapse = useDispatchCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      return subscribersGraphActions.Collapse({
        target: vm.rootTarget.id,
        key: vm.targetKey,
      });
    },
    [onContextMenuClose, vm.rootTarget.id, vm.targetKey]
  );

  const onCollapseAll = useDispatchCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      return subscribersGraphActions.CollapseAll({
        target: vm.rootTarget.id,
        key: vm.targetKey,
      });
    },
    [onContextMenuClose, vm.rootTarget.id, vm.targetKey]
  );

  const onGoToSource = useCallback(
    (event: MouseEvent) => {
      onContextMenuClose(event);
      if (vm.location) {
        const { file, line } = vm.location.location;
        chrome.devtools.panels.openResource(file, line - 1, () => {});
      }
    },
    [onContextMenuClose, vm.location]
  );

  const onClick = useDispatchCallback(
    (event: MouseEvent) => {
      if (vm.isCaller) {
        return;
      }
      return event.ctrlKey
        ? subscribersGraphActions.FocusTarget({
            target: vm.target,
            fromKey: vm.rootTargetKey,
            toKey: vm.targetKey,
          })
        : vm.isExpanded
        ? event.shiftKey
          ? subscribersGraphActions.CollapseAll({
              target: vm.rootTarget.id,
              key: vm.targetKey,
            })
          : subscribersGraphActions.Collapse({
              target: vm.rootTarget.id,
              key: vm.targetKey,
            })
        : event.shiftKey
        ? subscribersGraphActions.ExpandAll({
            target: vm.rootTarget.id,
            key: vm.targetKey,
          })
        : subscribersGraphActions.Expand({
            target: vm.rootTarget.id,
            key: vm.targetKey,
          });
    },
    [vm.isCaller, vm.isExpanded, vm.rootTarget.id, vm.targetKey]
  );

  const onMouseEnter = useDispatchCallback(
    () => subscribersGraphActions.TargetHovered({ target: vm.target }),
    [vm.target]
  );

  const onMouseLeave = useDispatchCallback(
    () => subscribersGraphActions.TargetUnhovered({ target: vm.target }),
    [vm.target]
  );

  useEffect(() => {
    tweenRef.current?.kill();
    if (vm.isSelected) {
      const direction = getDirection(vm.event.eventType);
      tweenRef.current = gsap.fromTo(
        circleRef.current,
        {
          strokeDasharray: circleCircumference / 12,
          strokeDashoffset: circleCircumference * direction,
        },
        {
          strokeDashoffset: 0,
          duration: 1,
          repeat: -1,
          ease: 'none',
        }
      );
    } else {
      gsap.set(elementRef.current, {
        strokeDasharray: 'none',
        strokeDashoffset: 0,
      });
    }
  }, [vm.isSelected && vm.event.eventType]);

  return (
    <g ref={elementRef}>
      <Menu
        open={menu.open}
        onClose={onContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={menu.position}
      >
        <MenuList dense>
          {menu.focusOptionVisible && (
            <MenuItem onClick={onFocus}>Focus</MenuItem>
          )}
          {menu.expandOptionVisible && (
            <MenuItem onClick={onExpand}>Expand</MenuItem>
          )}
          {menu.collapseOptionVisible && (
            <MenuItem onClick={onCollapse}>Collapse</MenuItem>
          )}
          {menu.expandAllOptionVisible && (
            <MenuItem onClick={onExpandAll}>Expand all </MenuItem>
          )}
          {menu.collapseAllOptionVisible && (
            <MenuItem onClick={onCollapseAll}>Collapse all</MenuItem>
          )}{' '}
          {menu.goToSourceOptionVisible && (
            <MenuItem onClick={onGoToSource}>Go to source</MenuItem>
          )}
        </MenuList>
      </Menu>
      <circle
        onContextMenu={onContextMenuOpen}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        data-target={vm.target.id}
        r={8}
        opacity={0}
        fill={vm.nodeColor}
        style={{ transition: `opacity ${duration}s` }}
      />
      <g
        opacity={vm.isExpanded || vm.isRoot || vm.isCaller ? 1 : 0.5}
        style={{ transition: `opacity ${duration}s`, pointerEvents: 'none' }}
      >
        {vm.isSelected && (
          <circle
            ref={circleRef}
            r={circleRadius}
            fill="transparent"
            stroke={vm.selectedColor}
          />
        )}
        <circle
          r={vm.isCaller ? 2 : vm.isExpanded ? 4 : 3}
          fill={vm.nodeColor}
          style={{ transition: `r ${duration}s` }}
        />
        <text
          fontFamily="Monospace"
          fontStyle="oblique"
          fontSize="6"
          textAnchor="middle"
          fill={vm.textColor}
          y="12"
        >
          {vm.target.name}{' '}
          <tspan fill={theme.palette.text.secondary}>#{vm.target.id}</tspan>
        </text>
        {vm.location && (
          <text
            fontFamily="Monospace"
            fontStyle="oblique"
            fontSize="3"
            textAnchor="middle"
            fill={theme.palette.text.secondary}
            y="18"
          >
            {vm.location.short}
            <title>{vm.location.long}</title>
          </text>
        )}
      </g>
    </g>
  );
});
