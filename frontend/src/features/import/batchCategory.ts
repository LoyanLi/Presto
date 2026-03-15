export type CategoryRow = {
  file_path: string
  category_id: string
}

export function applyCategoryToPaths<TFile extends CategoryRow, TProposal extends CategoryRow>(
  files: TFile[],
  proposals: TProposal[],
  selectedPaths: Iterable<string>,
  nextCategoryId: string,
): { files: TFile[]; proposals: TProposal[]; changed: boolean; proposalChanged: boolean } {
  const selected = new Set(selectedPaths)
  if (selected.size === 0 || !nextCategoryId) {
    return { files, proposals, changed: false, proposalChanged: false }
  }

  let filesChanged = false
  const nextFiles = files.map((row) => {
    if (!selected.has(row.file_path) || row.category_id === nextCategoryId) {
      return row
    }
    filesChanged = true
    return { ...row, category_id: nextCategoryId }
  })

  let proposalsChanged = false
  const nextProposals = proposals.map((row) => {
    if (!selected.has(row.file_path) || row.category_id === nextCategoryId) {
      return row
    }
    proposalsChanged = true
    return { ...row, category_id: nextCategoryId }
  })

  return {
    files: filesChanged ? nextFiles : files,
    proposals: proposalsChanged ? nextProposals : proposals,
    changed: filesChanged || proposalsChanged,
    proposalChanged: proposalsChanged,
  }
}
