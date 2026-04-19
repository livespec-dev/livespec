## Purpose

Define the LiveSpec Activity Bar tree and related navigation commands, including how discovered specs are surfaced from each repository's effective root spec directory.

## Requirements

### Requirement: LiveSpec provides a spec tree in the Activity Bar
The system SHALL contribute a dedicated LiveSpec view container in the VS Code Activity Bar that shows a tree of discovered spec files for the current workspace.

#### Scenario: Single-repository workspace shows the spec tree
- **WHEN** a user opens the LiveSpec Activity Bar view in a workspace with one repository that contains specs
- **THEN** LiveSpec shows a tree of folders and spec files for that repository

#### Scenario: Multi-root workspace disambiguates repositories
- **WHEN** a workspace contains more than one repository that contributes specs
- **THEN** LiveSpec groups tree items so users can distinguish which repository each spec belongs to

### Requirement: LiveSpec tree is rooted at the effective spec directory
The system SHALL show only spec markdown files that live under the effective root spec directory for each repository.

#### Scenario: Default root directory is used
- **WHEN** a repository does not override its root spec directory
- **THEN** the LiveSpec tree shows markdown spec files under repo-root `specs/`

#### Scenario: Configured root directory is used
- **WHEN** a repository config defines a supported root spec directory override
- **THEN** the LiveSpec tree shows markdown spec files under that configured directory instead of repo-root `specs/`

#### Scenario: Files outside the root are excluded
- **WHEN** a markdown file exists outside the effective root spec directory
- **THEN** LiveSpec does not show that file in the tree

### Requirement: LiveSpec tree opens specs in the LiveSpec viewer
The system SHALL open a selected spec file from the LiveSpec tree in the LiveSpec custom text editor.

#### Scenario: Selecting a spec file opens LiveSpec
- **WHEN** a user selects a spec file leaf in the LiveSpec tree
- **THEN** VS Code opens that file in the LiveSpec custom text editor

#### Scenario: Selecting a folder only navigates the tree
- **WHEN** a user selects or expands a folder node in the LiveSpec tree
- **THEN** LiveSpec expands or focuses that node without opening a spec viewer

### Requirement: LiveSpec provides a searchable Open Spec launcher
The system SHALL provide a command that lets users search discovered specs by file name or path and open the selected result in the LiveSpec viewer.

#### Scenario: Launcher matches file names and paths
- **WHEN** a user invokes `LiveSpec: Open Spec...` and types part of a spec file name or relative path
- **THEN** LiveSpec filters the available results to matching discovered specs

#### Scenario: Launcher opens the selected spec
- **WHEN** a user selects a spec from the Open Spec launcher
- **THEN** VS Code opens that file in the LiveSpec custom text editor

### Requirement: LiveSpec supports tree refresh and active-spec reveal
The system SHALL provide commands to refresh the spec tree contents and reveal the active spec within the tree.

#### Scenario: Manual refresh rebuilds the tree
- **WHEN** a user invokes the LiveSpec tree refresh action
- **THEN** LiveSpec rebuilds the discovered spec tree from the current workspace and repository configuration

#### Scenario: Reveal active spec locates the current viewer file
- **WHEN** a LiveSpec viewer is active and the user invokes `Reveal Active Spec`
- **THEN** LiveSpec reveals and focuses the corresponding spec file in the tree