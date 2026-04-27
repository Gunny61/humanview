import * as vscode from 'vscode';

// --- VISUAL DECORATIONS ---
function getGutterIcon(colorHex: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><rect x="7" y="0" width="3" height="20" fill="${colorHex}"/></svg>`;
    const encoded = encodeURIComponent(svg);
    return vscode.Uri.parse(`data:image/svg+xml;utf8,${encoded}`);
}

const verifiedDecoration = vscode.window.createTextEditorDecorationType({ gutterIconPath: getGutterIcon('#2ECC71') }); 
const reviewDecoration = vscode.window.createTextEditorDecorationType({ gutterIconPath: getGutterIcon('#F1C40F') }); 
const problemDecoration = vscode.window.createTextEditorDecorationType({ gutterIconPath: getGutterIcon('#E74C3C') }); 

// --- STATE MANAGEMENT ---
interface FileState { verified: Set<number>; review: Set<number>; problem: Set<number>; }
const documentStates: Record<string, FileState> = {};

function getState(uri: string): FileState {
    if (!documentStates[uri]) documentStates[uri] = { verified: new Set(), review: new Set(), problem: new Set() };
    return documentStates[uri];
}

function getRanges(document: vscode.TextDocument, lines: Set<number>): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    lines.forEach(line => { if (line < document.lineCount) ranges.push(document.lineAt(line).range); });
    return ranges;
}

function groupIntoBlocks(lines: number[]): {start: number, end: number}[] {
    if (lines.length === 0) return [];
    const blocks = [];
    let current = { start: lines[0], end: lines[0] };
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === current.end + 1) {
            current.end = lines[i]; 
        } else {
            blocks.push(current);
            current = { start: lines[i], end: lines[i] }; 
        }
    }
    blocks.push(current);
    return blocks;
}

// --- MARKED SECTIONS TREE ---
class HumanviewTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;
    refresh(): void { this._onDidChangeTreeData.fire(); }
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            const files: vscode.TreeItem[] = [];
            for (const [uriString, state] of Object.entries(documentStates)) {
                if (state.review.size > 0 || state.problem.size > 0) files.push(new FileTreeItem(vscode.Uri.parse(uriString), state));
            }
            return Promise.resolve(files);
        } else if (element instanceof FileTreeItem) {
            const marks: vscode.TreeItem[] = [];
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === element.uri.toString());
            const reviewBlocks = groupIntoBlocks(Array.from(element.state.review).sort((a, b) => a - b));
            for (const block of reviewBlocks) marks.push(new MarkBlockTreeItem(element.uri, block, 'review', doc));
            const problemBlocks = groupIntoBlocks(Array.from(element.state.problem).sort((a, b) => a - b));
            for (const block of problemBlocks) marks.push(new MarkBlockTreeItem(element.uri, block, 'problem', doc));
            return Promise.resolve(marks);
        }
        return Promise.resolve([]);
    }
}

class FileTreeItem extends vscode.TreeItem {
    constructor(public readonly uri: vscode.Uri, public readonly state: FileState) {
        super(vscode.workspace.asRelativePath(uri), vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = `${state.review.size} Review, ${state.problem.size} Problem`;
    }
}

class MarkBlockTreeItem extends vscode.TreeItem {
    constructor(public readonly uri: vscode.Uri, public readonly block: {start: number, end: number}, type: 'review'|'problem', doc: vscode.TextDocument | undefined) {
        super(block.start === block.end ? `Line ${block.start + 1}` : `Lines ${block.start + 1} - ${block.end + 1}`, vscode.TreeItemCollapsibleState.None);
        this.description = doc ? doc.lineAt(block.start).text.trim() : '';
        this.iconPath = type === 'problem' ? new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground')) : new vscode.ThemeIcon('eye', new vscode.ThemeColor('list.warningForeground'));
        this.command = { command: 'humanview.jumpToFileMark', title: 'Jump', arguments: [uri, block.start] };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const markTreeProvider = new HumanviewTreeProvider();
    vscode.window.registerTreeDataProvider('humanviewTree', markTreeProvider);

    function updateDecorations(editor: vscode.TextEditor) {
        const uri = editor.document.uri.toString();
        const state = getState(uri);
        editor.setDecorations(verifiedDecoration, getRanges(editor.document, state.verified));
        editor.setDecorations(reviewDecoration, getRanges(editor.document, state.review));
        editor.setDecorations(problemDecoration, getRanges(editor.document, state.problem));
        markTreeProvider.refresh(); 
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorations(editor);
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        const uri = event.document.uri.toString();
        if (!documentStates[uri]) return; 
        
        const state = getState(uri);
        let stateChanged = false;
        const changes = [...event.contentChanges].sort((a, b) => b.range.start.line - a.range.start.line);

        for (const change of changes) {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
            const lineDelta = (change.text.match(/\n/g) || []).length - (endLine - startLine);

            const updateSet = (oldSet: Set<number>) => {
                const newSet = new Set<number>();
                for (const line of oldSet) {
                    if (line >= startLine && line <= endLine) {
                        if (line === startLine && change.rangeLength === 0 && /^[\s\r\n]+$/.test(change.text)) {
                            newSet.add(line); continue;
                        }
                        stateChanged = true; continue; 
                    }
                    if (line > endLine) {
                        newSet.add(line + lineDelta);
                        if (lineDelta !== 0) stateChanged = true;
                    } else { newSet.add(line); }
                }
                return newSet;
            };

            state.verified = updateSet(state.verified);
            state.review = updateSet(state.review);
            state.problem = updateSet(state.problem);
        }

        if (stateChanged) {
            vscode.window.visibleTextEditors.forEach(editor => {
                if (editor.document.uri.toString() === uri) updateDecorations(editor);
            });
            markTreeProvider.refresh();
        }
    });

    function applyMark(colorType: 'verified' | 'review' | 'problem') {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const state = getState(editor.document.uri.toString());
        for (let i = editor.selection.start.line; i <= editor.selection.end.line; i++) {
            if (!editor.document.lineAt(i).isEmptyOrWhitespace) {
                state.verified.delete(i); state.review.delete(i); state.problem.delete(i);
                if (colorType === 'verified') state.verified.add(i);
                if (colorType === 'review') state.review.add(i);
                if (colorType === 'problem') state.problem.add(i);
            }
        }
        updateDecorations(editor);
    }

    let markVerified = vscode.commands.registerCommand('humanview.markVerified', () => applyMark('verified'));
    let markForReview = vscode.commands.registerCommand('humanview.markForReview', () => applyMark('review'));
    let markProblem = vscode.commands.registerCommand('humanview.markProblem', () => applyMark('problem'));

    let clearMark = vscode.commands.registerCommand('humanview.clearMark', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const state = getState(editor.document.uri.toString());
        for (let i = editor.selection.start.line; i <= editor.selection.end.line; i++) {
            state.verified.delete(i); state.review.delete(i); state.problem.delete(i);
        }
        updateDecorations(editor);
    });

    function jumpToMark(direction: 'next' | 'prev') {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const state = getState(editor.document.uri.toString());
        const allMarks = [...state.verified, ...state.review, ...state.problem].sort((a, b) => a - b);
        if (allMarks.length === 0) return;

        const blocks = groupIntoBlocks(allMarks);
        const currentLine = editor.selection.active.line;
        let targetLineNum = -1;

        if (direction === 'next') {
            const nextBlock = blocks.find(b => b.start > currentLine);
            targetLineNum = nextBlock ? nextBlock.start : blocks[0].start; 
        } else {
            const prevBlocks = blocks.filter(b => b.start < currentLine);
            targetLineNum = prevBlocks.length > 0 ? prevBlocks[prevBlocks.length - 1].start : blocks[blocks.length - 1].start; 
        }

        const targetLine = editor.document.lineAt(targetLineNum);
        editor.selection = new vscode.Selection(targetLine.range.start, targetLine.range.end);
        editor.revealRange(targetLine.range, vscode.TextEditorRevealType.InCenter);
    }

    let nextMark = vscode.commands.registerCommand('humanview.nextMark', () => jumpToMark('next'));
    let prevMark = vscode.commands.registerCommand('humanview.prevMark', () => jumpToMark('prev'));

    let jumpToFileMark = vscode.commands.registerCommand('humanview.jumpToFileMark', async (uri: vscode.Uri, lineNum: number) => {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        const targetLine = document.lineAt(lineNum);
        editor.selection = new vscode.Selection(targetLine.range.start, targetLine.range.end);
        editor.revealRange(targetLine.range, vscode.TextEditorRevealType.InCenter);
    });

    let showSummary = vscode.commands.registerCommand('humanview.showSummary', () => {
        vscode.commands.executeCommand('humanviewTree.focus'); 
    });

    context.subscriptions.push(
        markVerified, markForReview, markProblem, clearMark, 
        showSummary, nextMark, prevMark, jumpToFileMark
    );
}

export function deactivate() {}