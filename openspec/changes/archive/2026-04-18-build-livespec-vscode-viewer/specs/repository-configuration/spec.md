## ADDED Requirements

### Requirement: LiveSpec reads repository configuration from `.livespec/config.json`
The system SHALL use `.livespec/config.json` at the repository root as the canonical repository-level LiveSpec configuration file.

#### Scenario: Load checked-in repo config
- **WHEN** a repository contains `.livespec/config.json`
- **THEN** LiveSpec loads repository behavior from that file for documents in the repository

### Requirement: LiveSpec validates repository configuration
The system SHALL require `.livespec/config.json` to be valid JSON with a top-level `version` field.

#### Scenario: Valid config is accepted
- **WHEN** `.livespec/config.json` contains valid JSON with the required top-level `version` field
- **THEN** LiveSpec accepts the configuration and applies its supported settings

#### Scenario: Invalid config falls back safely
- **WHEN** `.livespec/config.json` is missing, malformed, or does not satisfy the supported schema
- **THEN** LiveSpec falls back to default repository behavior instead of preventing the document from opening

### Requirement: LiveSpec uses a default spec-file glob
The system SHALL default the effective spec-file glob to `**/specs/**/*.md` when no repository override is present.

#### Scenario: Default glob applies without repo override
- **WHEN** a repository does not provide a supported spec-file-glob override
- **THEN** LiveSpec treats `**/specs/**/*.md` as the effective spec-file glob

### Requirement: LiveSpec supports repository-specific spec-file globs
The system SHALL let repositories override the default spec-file glob in `.livespec/config.json`.

#### Scenario: Repository override changes matching files
- **WHEN** `.livespec/config.json` defines a supported spec-file-glob override
- **THEN** LiveSpec uses that override to decide which markdown files match the LiveSpec viewer

#### Scenario: Matching uses the containing repository
- **WHEN** a markdown file belongs to a workspace with multiple repositories or folders
- **THEN** LiveSpec resolves the effective spec-file glob from the repository that contains that file
