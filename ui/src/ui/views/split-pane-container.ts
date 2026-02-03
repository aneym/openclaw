/**
 * Recursive renderer for the split-pane binary tree.
 *
 * SplitBranch -> flex container (row or column) with two children + resizable divider
 * SplitLeaf   -> renderChatPane() with the leaf's session
 */
import { html } from "lit";
import type { AppViewState } from "../app-view-state";
import type { SplitNode, SplitBranch, SplitLeaf } from "../split-tree";
import { renderChatPane } from "./chat-pane";
import { renderTerminalPane } from "./terminal-pane";
import "../components/resizable-divider";

export function renderSplitPaneContainer(state: AppViewState) {
  return html`
    <div class="split-pane-root">
      ${renderNode(state.splitLayout.root, state)}
    </div>
  `;
}

function renderNode(node: SplitNode, state: AppViewState): ReturnType<typeof html> {
  if (node.kind === "leaf") {
    return renderLeaf(node, state);
  }
  return renderBranch(node, state);
}

function renderLeaf(leaf: SplitLeaf, state: AppViewState): ReturnType<typeof html> {
  const isFocused = state.focusedPaneId === leaf.id;
  if (leaf.paneType === "terminal") {
    return renderTerminalPane({ paneId: leaf.id, terminalId: leaf.threadId, state, isFocused });
  }
  const paneState = state.paneStates.get(leaf.id);
  return renderChatPane({ leaf, state, paneState, isFocused });
}

function renderBranch(branch: SplitBranch, state: AppViewState): ReturnType<typeof html> {
  const isHorizontal = branch.direction === "horizontal";
  const flexDir = isHorizontal ? "row" : "column";
  const firstSize = `${branch.ratio * 100}%`;

  return html`
    <div
      class="split-branch split-branch--${branch.direction}"
      data-branch-id=${branch.id}
      style="display:flex;flex-direction:${flexDir};flex:1;min-height:0;min-width:0;overflow:hidden;"
    >
      <div class="split-branch__child" style="flex:0 0 ${firstSize};min-height:0;min-width:0;overflow:hidden;display:flex;">
        ${renderNode(branch.first, state)}
      </div>
      <resizable-divider
        .splitRatio=${branch.ratio}
        .minRatio=${0.15}
        .maxRatio=${0.85}
        .direction=${branch.direction}
        @resize=${(e: CustomEvent) => state.handleSplitBranchResize(branch.id, e.detail.splitRatio)}
      ></resizable-divider>
      <div class="split-branch__child" style="flex:1;min-height:0;min-width:0;overflow:hidden;display:flex;">
        ${renderNode(branch.second, state)}
      </div>
    </div>
  `;
}
