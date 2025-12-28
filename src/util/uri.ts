import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Converts a file URI to a workspace-relative path
 */
export function toRelativePath(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (workspaceFolder) {
    return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
  }
  return uri.fsPath;
}

/**
 * Resolves a relative path against a workspace folder
 */
export function resolveWorkspacePath(relativePath: string): vscode.Uri | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);
}

/**
 * Gets the URI string for use as a map key
 */
export function uriToKey(uri: vscode.Uri): string {
  return uri.toString();
}

/**
 * Checks if a URI matches a glob pattern
 */
export function matchesGlob(uri: vscode.Uri, pattern: string): boolean {
  const relativePath = toRelativePath(uri);
  const minimatch = createMinimatch(pattern);
  return minimatch(relativePath);
}

/**
 * Simple glob matcher (supports ** and *)
 */
function createMinimatch(pattern: string): (path: string) => boolean {
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\//g, '\\/');
  const regex = new RegExp(`^${regexPattern}$`);
  return (p: string) => regex.test(p.replace(/\\/g, '/'));
}

/**
 * Gets all workspace folders
 */
export function getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders || [];
}

/**
 * Finds files matching a glob pattern in the workspace
 */
export async function findFiles(pattern: string, exclude?: string): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(pattern, exclude);
}
