import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { getIndexStore, disposeIndexStore } from './validation/indexStore';
import { LightweightValidator } from './validation/lightweightValidator';
import { FullAstValidator } from './validation/fullAstValidator';
import { DiagnosticsProvider } from './validation/diagnosticsProvider';
import { WeaveCodeActionProvider } from './validation/quickFix';
import { createWeavePlugin } from './preview/markdownItPlugin';
import { createWeaveFormatPlugin } from './preview/weaveFormatPlugin';
import { registerCompletionProvider } from './languageFeatures/completionProvider';
import { registerHoverProvider } from './languageFeatures/hoverProvider';
import { registerDefinitionProvider } from './languageFeatures/definitionProvider';
import { registerGotoDefinitionCommand } from './commands/gotoDefinition';
import { registerPeekSectionCommand } from './commands/peekSection';
import { registerShowBacklinksCommand } from './commands/showBacklinks';
import { debounce } from './util/debounce';

let validator: LightweightValidator | undefined;
let fullAstValidator: FullAstValidator | undefined;
let diagnosticsProvider: DiagnosticsProvider | undefined;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): { extendMarkdownIt: (md: MarkdownIt) => MarkdownIt } {
  console.log('Weave Markdown extension activating...');

  // Initialize validation layer
  validator = new LightweightValidator();
  fullAstValidator = new FullAstValidator();
  diagnosticsProvider = new DiagnosticsProvider();

  // Register language features
  registerCompletionProvider(context);
  registerHoverProvider(context);
  registerDefinitionProvider(context);

  // Register commands
  registerGotoDefinitionCommand(context);
  registerPeekSectionCommand(context);
  registerShowBacklinksCommand(context);
  registerValidationCommands(context);

  // Register code action provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      'markdown',
      new WeaveCodeActionProvider(),
      { providedCodeActionKinds: WeaveCodeActionProvider.providedCodeActionKinds }
    )
  );

  // Set up file watchers and document change handlers
  setupFileWatchers(context);

  // Initial workspace indexing
  indexWorkspace();

  // Add disposables
  context.subscriptions.push({
    dispose: () => {
      validator?.dispose();
      fullAstValidator?.dispose();
      diagnosticsProvider?.dispose();
      disposeIndexStore();
    }
  });

  console.log('Weave Markdown extension activated');

  // Return markdown-it extension
  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      const config = vscode.workspace.getConfiguration('weave');
      if (config.get('enablePreviewEnhancements', true)) {
        createWeavePlugin(md);
        createWeaveFormatPlugin(md);
      }
      return md;
    }
  };
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log('Weave Markdown extension deactivating...');
  validator?.dispose();
  fullAstValidator?.dispose();
  diagnosticsProvider?.dispose();
  disposeIndexStore();
}

/**
 * Registers validation commands
 */
function registerValidationCommands(context: vscode.ExtensionContext): void {
  // Full conformance check command (uses @weave-md/parse for deep AST validation)
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.fullConformanceCheck', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        fullAstValidator?.validate(editor.document);
        vscode.window.showInformationMessage('Weave full conformance check complete. See Problems panel for results.');
      } else {
        vscode.window.showWarningMessage('Open a Markdown file to run conformance check');
      }
    })
  );

  // Validate workspace command
  context.subscriptions.push(
    vscode.commands.registerCommand('weave.validateWorkspace', async () => {
      await indexWorkspace();
      vscode.window.showInformationMessage('Weave workspace validation complete. See Problems panel for results.');
    })
  );
}

/**
 * Sets up file watchers for automatic validation
 */
function setupFileWatchers(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('weave');
  const sectionsGlob = config.get<string>('sectionsGlob', 'sections/**/*.md');
  const rootFile = config.get<string>('rootFile', 'main.md');

  // Debounced validation for active document
  const debouncedValidate = debounce((document: vscode.TextDocument) => {
    if (document.languageId === 'markdown') {
      validator?.validate(document);
    }
  }, 300);

  // Validate on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      debouncedValidate(event.document);
    })
  );

  // Validate on document open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.languageId === 'markdown') {
        validator?.validate(document);
      }
    })
  );

  // Validate on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.languageId === 'markdown') {
        validator?.validate(document);
      }
    })
  );

  // Watch for file creation/deletion
  const watcher = vscode.workspace.createFileSystemWatcher(`**/{${rootFile},${sectionsGlob}}`);

  context.subscriptions.push(
    watcher.onDidCreate(async uri => {
      const document = await vscode.workspace.openTextDocument(uri);
      validator?.validate(document);
    })
  );

  context.subscriptions.push(
    watcher.onDidDelete(uri => {
      const indexStore = getIndexStore();
      indexStore.removeFileIndex(uri);
      validator?.clearDiagnostics(uri);
    })
  );

  context.subscriptions.push(
    watcher.onDidChange(async uri => {
      const document = await vscode.workspace.openTextDocument(uri);
      validator?.validate(document);
    })
  );

  context.subscriptions.push(watcher);
}

/**
 * Indexes all Weave files in the workspace
 */
async function indexWorkspace(): Promise<void> {
  const config = vscode.workspace.getConfiguration('weave');
  const sectionsGlob = config.get<string>('sectionsGlob', 'sections/**/*.md');
  const rootFile = config.get<string>('rootFile', 'main.md');

  // Find all matching files - use broader glob patterns to catch nested structures
  const rootFiles = await vscode.workspace.findFiles(`**/${rootFile}`);
  const sectionFiles = await vscode.workspace.findFiles(`**/${sectionsGlob}`);
  const allFiles = [...rootFiles, ...sectionFiles];
  
  console.log(`Weave: Indexing ${allFiles.length} files (${rootFiles.length} root, ${sectionFiles.length} sections)`);

  // Index files in batches to avoid blocking UI
  const batchSize = 10;
  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async uri => {
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        validator?.validate(document);
      } catch (error) {
        console.error(`Error indexing ${uri.fsPath}:`, error);
      }
    }));

    // Yield to event loop between batches
    if (i + batchSize < allFiles.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}
