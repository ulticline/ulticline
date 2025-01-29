// MockDiffViewProvider.ts
import { DiffViewProvider } from "../../../../integrations/editor/DiffViewProvider"

export class MockDiffViewProvider extends DiffViewProvider {
  public override editType: "create" | "modify" = "modify"
  public override originalContent: string = "original content"
  public override isEditing: boolean = false

  constructor(cwd: string) {
    super(cwd)
  }

  public override async open(relPath: string) {
    this.isEditing = true
  }

  public override async update(newContent: string, final?: boolean) {
    // store or track the updated content
  }

  public override async revertChanges() {
    this.isEditing = false
  }

  public override async reset() {
    // reset state
    this.isEditing = false
  }

  public override async saveChanges() {
    // return a mock result
    return {
      newProblemsMessage: "",
      userEdits: "",
      autoFormattingEdits: "",
      finalContent: "new final content"
    }
  }
}