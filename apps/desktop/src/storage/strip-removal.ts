import { PrintError } from '../printing/print-layout.ts';
import { validUuid } from '../printing/paper-layout.ts';

interface StripRemovalDependencies {
  stripFile: (id: string) => string;
  paperState: () => Promise<{
    issue: string;
    queue: { stripId: string }[];
  }>;
  busy: () => boolean;
  pending: (id: string) => boolean;
  trash: (filename: string) => Promise<void>;
}
export class StripRemovalService {
  private removing = new Set<string>();
  private dependencies: StripRemovalDependencies;
  constructor(dependencies: StripRemovalDependencies) {
    this.dependencies = dependencies;
  }
  assertAvailable(id: string) {
    if (this.removing.has(id))
      throw new PrintError(
        'This strip is being deleted. Wait for deletion to finish.',
      );
  }
  async remove(input: unknown) {
    if (!validUuid(input))
      throw new PrintError('Choose a saved strip to delete.');
    this.assertAvailable(input);
    this.removing.add(input);
    try {
      if (this.dependencies.pending(input))
        throw new PrintError(
          'Finish reviewing and saving this session before deleting its strip.',
        );
      let filename: string;
      try {
        filename = this.dependencies.stripFile(input);
      } catch {
        throw new PrintError(
          'The saved strip is no longer available. Refresh your library.',
        );
      }
      // Reserving the ID first prevents queue additions or print reads during deletion.
      const papers = await this.dependencies.paperState();
      if (papers.issue)
        throw new PrintError(
          'Paper records could not be checked. Resolve the paper-record issue before deleting strips.',
        );
      if (papers.queue.some((entry) => entry.stripId === input))
        throw new PrintError(
          'Remove this strip from the print queue in Paper & layout before deleting it.',
        );
      if (this.dependencies.busy())
        throw new PrintError(
          'Wait for the current print job to finish before deleting a strip.',
        );
      try {
        await this.dependencies.trash(filename);
      } catch {
        throw new PrintError(
          'Could not move this strip to the Recycle Bin. Check that its file is not in use and try again.',
        );
      }
      // Library metadata stays intact. Missing images are hidden by library.read();
      // restoring the original JPEG from the Recycle Bin makes the strip visible again.
    } finally {
      this.removing.delete(input);
    }
  }
}
