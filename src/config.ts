import * as vscode from 'vscode';

export interface WeaveConfig {
  rootFile: string;
  sectionsGlob: string;
  enablePreviewEnhancements: boolean;
  maxPreviewDepth: number;
  peekMaxChars: number;
  maxExpandedCharsPerRef: number;
  maxExpandedRefsPerDoc: number;
  showPreviewLabels: boolean;
  strictNodeParams: boolean;
  sidenoteMinWidth: number;
}

class ConfigurationManager {
  private _config: WeaveConfig;
  private _disposable: vscode.Disposable;

  constructor() {
    this._config = this.load();
    this._disposable = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('weave')) {
        this._config = this.load();
      }
    });
  }

  private load(): WeaveConfig {
    const cfg = vscode.workspace.getConfiguration('weave');
    return {
      rootFile: cfg.get('rootFile', 'main.md'),
      sectionsGlob: cfg.get('sectionsGlob', 'sections/**/*.md'),
      enablePreviewEnhancements: cfg.get('enablePreviewEnhancements', true),
      maxPreviewDepth: cfg.get('maxPreviewDepth', 3),
      peekMaxChars: cfg.get('peekMaxChars', 240),
      maxExpandedCharsPerRef: cfg.get('maxExpandedCharsPerRef', 12000),
      maxExpandedRefsPerDoc: cfg.get('maxExpandedRefsPerDoc', 50),
      showPreviewLabels: cfg.get('showPreviewLabels', true),
      strictNodeParams: cfg.get('strictNodeParams', false),
      sidenoteMinWidth: cfg.get('sidenoteMinWidth', 800),
    };
  }

  get(): WeaveConfig {
    return this._config;
  }

  dispose(): void {
    this._disposable.dispose();
  }
}

export const config = new ConfigurationManager();
