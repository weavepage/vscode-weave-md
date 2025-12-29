import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { getIndexStore, disposeIndexStore } from './validation/indexStore';
import { LightweightValidator } from './validation/lightweightValidator';
import { FullAstValidator } from './validation/fullAstValidator';
import { DiagnosticsProvider } from './validation/diagnosticsProvider';
import { WeaveCodeActionProvider } from './validation/quickFix';
import { createWeavePlugin, createWeaveFormatPlugin } from './preview/markdownItPlugin';
import { registerCompletionProvider } from './languageFeatures/completionProvider';
import { registerHoverProvider } from './languageFeatures/hoverProvider';
import { registerDefinitionProvider } from './languageFeatures/definitionProvider';
import { registerDocumentLinkProvider } from './languageFeatures/documentLinkProvider';
import { registerReferenceProvider } from './languageFeatures/referenceProvider';
import { registerGotoDefinitionCommand } from './commands/gotoDefinition';
import { registerPeekSectionCommand } from './commands/peekSection';
import { registerShowBacklinksCommand } from './commands/showBacklinks';
import { debounce } from './util/debounce';

let validator: LightweightValidator | undefined;
let fullAstValidator: FullAstValidator | undefined;
let diagnosticsProvider: DiagnosticsProvider | undefined;
let isIndexingWorkspace = false;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): { extendMarkdownIt: (md: MarkdownIt) => MarkdownIt } {
  console.log('WeaveMD extension: activation started');
  
  try {
    validator = new LightweightValidator();
    fullAstValidator = new FullAstValidator();
    diagnosticsProvider = new DiagnosticsProvider();
    console.log('WeaveMD extension: validation layer initialized');

  registerCompletionProvider(context);
    registerHoverProvider(context);
    registerDefinitionProvider(context);
    registerDocumentLinkProvider(context);
    registerReferenceProvider(context);
    registerGotoDefinitionCommand(context);
    registerPeekSectionCommand(context);
    registerShowBacklinksCommand(context);
    registerValidationCommands(context);
    console.log('WeaveMD extension: providers and commands registered');

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        'markdown',
        new WeaveCodeActionProvider(),
        { providedCodeActionKinds: WeaveCodeActionProvider.providedCodeActionKinds }
      )
    );

    setupFileWatchers(context);
    indexWorkspace();
    console.log('WeaveMD extension: indexing completed');

    context.subscriptions.push({
      dispose: () => {
        validator?.dispose();
        fullAstValidator?.dispose();
        diagnosticsProvider?.dispose();
        disposeIndexStore();
      }
    });

    console.log('WeaveMD extension: activation complete');

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
  } catch (error) {
    console.error('Extension activation failed:', error);
    throw error;
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
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

  // Validate on document open (skip during initial workspace indexing)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (!isIndexingWorkspace && document.languageId === 'markdown') {
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
  isIndexingWorkspace = true;
  try {
    const config = vscode.workspace.getConfiguration('weave');
    const sectionsGlob = config.get<string>('sectionsGlob', 'sections/**/*.md');
    const rootFile = config.get<string>('rootFile', 'main.md');

    const rootFiles = await vscode.workspace.findFiles(`**/${rootFile}`);
    const sectionFiles = await vscode.workspace.findFiles(`**/${sectionsGlob}`);
    const allFiles = [...rootFiles, ...sectionFiles];

    console.log(`WeaveMD: indexing ${allFiles.length} files`);

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
      if (i + batchSize < allFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    console.log('WeaveMD: indexing complete');
  } catch (error) {
    console.error('indexWorkspace failed:', error);
    throw error;
  } finally {
    isIndexingWorkspace = false;
  }
}
