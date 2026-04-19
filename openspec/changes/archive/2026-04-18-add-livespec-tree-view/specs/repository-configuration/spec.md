## MODIFIED Requirements

### Requirement: LiveSpec validates repository configuration
The system SHALL require `.livespec/config.json` to be valid JSON with a top-level `version` field and SHALL validate supported repository settings including an optional `specRootDir`.

#### Scenario: Valid config is accepted
- **WHEN** `.livespec/config.json` contains valid JSON with the required top-level `version` field and supported repository settings
- **THEN** LiveSpec accepts the configuration and applies its supported settings

#### Scenario: Invalid config falls back safely
- **WHEN** `.livespec/config.json` is missing, malformed, or does not satisfy the supported schema
- **THEN** LiveSpec falls back to default repository behavior instead of preventing the document from opening

#### Scenario: Invalid spec root falls back safely
- **WHEN** `.livespec/config.json` provides an unsupported or invalid `specRootDir` value
- **THEN** LiveSpec falls back to the default root spec directory for discovery

## ADDED Requirements

### Requirement: LiveSpec uses a default root spec directory
The system SHALL default the effective root spec directory to repo-root `specs/` when no repository override is present.

#### Scenario: Default root applies without repo override
- **WHEN** a repository does not provide a supported root spec directory override
- **THEN** LiveSpec treats `<repositoryRoot>/specs` as the effective root spec directory for spec discovery

### Requirement: LiveSpec supports repository-specific root spec directories
The system SHALL let repositories override the default root spec directory in `.livespec/config.json`.

#### Scenario: Repository override changes discovered specs
- **WHEN** `.livespec/config.json` defines a supported `specRootDir` override
- **THEN** LiveSpec uses that repository-relative directory to decide which spec files appear in the tree and Open Spec launcher

#### Scenario: Root resolution uses the containing repository
- **WHEN** a markdown file belongs to a workspace with multiple repositories or folders
- **THEN** LiveSpec resolves the effective root spec directory from the repository that contains that file

## REMOVED Requirements

### Requirement: LiveSpec uses a default spec-file glob
**Reason**: Tree-based discovery needs a single explicit navigation root instead of a free-form glob.
**Migration**: Move specs under repo-root `specs/` or configure `specRootDir` in `.livespec/config.json`.

### Requirement: LiveSpec supports repository-specific spec-file globs
**Reason**: LiveSpec now discovers specs from a configurable root spec directory rather than a free-form glob.
**Migration**: Replace `specFileGlob` overrides with a repository-relative `specRootDir` override.
