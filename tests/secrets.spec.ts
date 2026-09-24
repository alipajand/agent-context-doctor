import { describe, it, expect } from 'vitest'
import { checkSecrets } from '../src/audit/checks/secrets.js'

// Assembled at runtime so no literal credential-shaped strings live in the repo.
const fake = {
  aws: 'AKIA' + 'Q7X2M4N8P3R5T9V1',
  github: 'ghp' + '_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
  anthropic: 'sk-' + 'ant-' + 'api03-' + 'x9Y8w7V6u5T4s3R2q1P0o9N8',
  openai: 'sk-' + 'proj-' + 'Z1y2X3w4V5u6T7s8R9q0P1o2N3m4L5k6J7',
  stripe: 'sk' + '_live_' + 'Ab12Cd34Ef56Gh78Ij90',
  slack: 'xox' + 'b-1234567890-abcdefghij',
  npm: 'npm' + '_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
}

describe('checkSecrets', () => {
  it('reports nothing for ordinary instructions', () => {
    expect(checkSecrets('AGENTS.md', 'Use the API key from the environment.')).toEqual([])
  })

  it.each([
    ['AWS access key ID', fake.aws],
    ['GitHub token', fake.github],
    ['Anthropic API key', fake.anthropic],
    ['OpenAI API key', fake.openai],
    ['Stripe secret key', fake.stripe],
    ['Slack token', fake.slack],
    ['npm access token', fake.npm],
    ['private key', fake.pem],
  ])('flags a %s as high', (label, value) => {
    const [issue] = checkSecrets('CLAUDE.md', `Use ${value} for local testing.`)
    expect(issue.severity).toBe('high')
    expect(issue.category).toBe('secrets')
    expect(issue.message).toContain(label)
  })

  it('never includes the secret in the evidence', () => {
    const [issue] = checkSecrets('AGENTS.md', `token ${fake.github}`)
    expect(issue.evidence).not.toContain(fake.github)
    expect(issue.evidence).toContain('ghp_')
    expect(issue.evidence).toContain('*')
  })

  it('does not report an Anthropic key as an OpenAI key', () => {
    const [issue] = checkSecrets('AGENTS.md', fake.anthropic)
    expect(issue.message).not.toContain('OpenAI')
  })

  it('flags a credential-looking assignment as medium', () => {
    const [issue] = checkSecrets('AGENTS.md', 'DB password: hunter2hunter2')
    expect(issue.severity).toBe('medium')
    expect(issue.evidence).not.toContain('hunter2hunter2')
  })

  it.each([
    'api_key = <your-api-key>',
    'API_KEY=${API_KEY}',
    'password: process.env.DB_PASSWORD',
    'secret = os.environ["SECRET_KEY"]',
    'token = get_token(scope)',
    'AWS docs use AKIAIOSFODNN7EXAMPLE as a sample',
    'password: changeme123',
  ])('ignores placeholders and lookups: %s', (line) => {
    expect(checkSecrets('AGENTS.md', line)).toEqual([])
  })

  it('reports the line number', () => {
    const issues = checkSecrets('AGENTS.md', `# Setup\n\nexport KEY=${fake.aws}`)
    expect(issues[0].line).toBe(3)
  })
})
