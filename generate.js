import { parse, print } from 'maml-ast'
import { parse as parseValue, stringify } from 'maml.js'
import { faker } from '@faker-js/faker'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// AST Builder Helpers
// ---------------------------------------------------------------------------

const s = { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }

function str(value) {
  return { type: 'String', value, raw: JSON.stringify(value), span: s }
}

function raw(value) {
  return { type: 'RawString', value, raw: '"""\n' + value + '\n"""', span: s }
}

function int(value) {
  return { type: 'Integer', value, raw: String(value), span: s }
}

function float(value) {
  return { type: 'Float', value, raw: String(value), span: s }
}

function bool(value) {
  return { type: 'Boolean', value, span: s }
}

function nil() {
  return { type: 'Null', value: null, span: s }
}

function comment(text) {
  return { type: 'Comment', value: ' ' + text, span: s }
}

const KEY_RE = /^[A-Za-z0-9_-]+$/

function prop(key, value, opts = {}) {
  const keyNode = KEY_RE.test(key)
    ? { type: 'Identifier', value: key, span: s }
    : { type: 'String', value: key, raw: JSON.stringify(key), span: s }
  return {
    key: keyNode,
    value,
    span: s,
    leadingComments: opts.leadingComments || [],
    trailingComment: opts.trailingComment || null,
    emptyLineBefore: opts.emptyLineBefore || false,
  }
}

function obj(properties, danglingComments = []) {
  return { type: 'Object', properties, span: s, danglingComments }
}

function elem(value, opts = {}) {
  return {
    value,
    leadingComments: opts.leadingComments || [],
    trailingComment: opts.trailingComment || null,
    emptyLineBefore: opts.emptyLineBefore || false,
  }
}

function arr(elements, danglingComments = []) {
  return { type: 'Array', elements, span: s, danglingComments }
}

function doc(value, leadingComments = [], danglingComments = []) {
  return { type: 'Document', value, leadingComments, danglingComments, span: s }
}

// ---------------------------------------------------------------------------
// Random value helpers
// ---------------------------------------------------------------------------

function randomScalar() {
  const kind = faker.helpers.arrayElement(['string', 'int', 'float', 'bool', 'null'])
  switch (kind) {
    case 'string': return str(faker.helpers.arrayElement([
      faker.person.fullName(),
      faker.internet.email(),
      faker.internet.url(),
      faker.lorem.sentence(),
      faker.system.filePath(),
      faker.color.human(),
      faker.location.city(),
      faker.company.name(),
      faker.git.commitSha({ length: 7 }),
      faker.internet.ipv4(),
    ]))
    case 'int': return int(faker.number.int({ min: 0, max: 100000 }))
    case 'float': return float(parseFloat(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }).toFixed(2)))
    case 'bool': return bool(faker.datatype.boolean())
    case 'null': return nil()
  }
}

function randomKey() {
  return faker.helpers.arrayElement([
    faker.word.noun(),
    faker.word.adjective() + '_' + faker.word.noun(),
    faker.database.column(),
    faker.hacker.abbreviation().toLowerCase(),
  ]).replace(/\s+/g, '_').toLowerCase()
}

// ---------------------------------------------------------------------------
// Shape 1: Flat Config
// ---------------------------------------------------------------------------

function generateFlatConfig() {
  const templates = [
    () => {
      const name = faker.word.noun().toLowerCase() + '-' + faker.word.adjective().toLowerCase()
      return {
        title: 'Package Config',
        description: 'A package manager configuration file.',
        document: doc(obj([
          prop('name', str(name)),
          prop('version', str(faker.system.semver())),
          prop('description', str(faker.lorem.sentence())),
          prop('license', str(faker.helpers.arrayElement(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'GPL-3.0']))),
          prop('author', str(faker.person.fullName()), { emptyLineBefore: true }),
          prop('homepage', str(faker.internet.url())),
          prop('repository', str(`https://github.com/${faker.internet.username()}/${name}`)),
          prop('private', bool(faker.datatype.boolean()), { emptyLineBefore: true }),
          prop('type', str('module')),
        ])),
      }
    },
    () => ({
      title: 'Database Config',
      description: 'Database connection settings.',
      document: doc(obj([
        prop('host', str(faker.internet.domainName()), { trailingComment: comment('database server') }),
        prop('port', int(faker.helpers.arrayElement([3306, 5432, 27017, 6379, 9042]))),
        prop('database', str(faker.word.noun().toLowerCase() + '_' + faker.helpers.arrayElement(['prod', 'staging', 'dev']))),
        prop('username', str(faker.internet.username().toLowerCase())),
        prop('password', str(faker.internet.password())),
        prop('ssl', bool(true), { emptyLineBefore: true, leadingComments: [comment('Security settings')] }),
        prop('pool_size', int(faker.number.int({ min: 5, max: 50 }))),
        prop('timeout', int(faker.number.int({ min: 1000, max: 30000 })), { trailingComment: comment('milliseconds') }),
      ])),
    }),
    () => ({
      title: 'App Settings',
      description: 'Application environment configuration.',
      document: doc(obj([
        prop('app_name', str(faker.company.name())),
        prop('environment', str(faker.helpers.arrayElement(['production', 'staging', 'development', 'test']))),
        prop('debug', bool(faker.datatype.boolean())),
        prop('port', int(faker.number.int({ min: 3000, max: 9000 }))),
        prop('log_level', str(faker.helpers.arrayElement(['debug', 'info', 'warn', 'error'])),
          { emptyLineBefore: true, leadingComments: [comment('Logging')] }),
        prop('log_format', str(faker.helpers.arrayElement(['json', 'text', 'pretty']))),
        prop('api_version', str('v' + faker.number.int({ min: 1, max: 5 }))),
        prop('max_request_size', str(faker.number.int({ min: 1, max: 100 }) + 'mb')),
      ])),
    }),
    () => ({
      title: 'Redis Config',
      description: 'Redis cache configuration.',
      document: doc(obj([
        prop('host', str(faker.helpers.arrayElement(['localhost', '127.0.0.1', 'redis.internal']))),
        prop('port', int(6379)),
        prop('db', int(faker.number.int({ min: 0, max: 15 }))),
        prop('password', faker.datatype.boolean() ? str(faker.internet.password()) : nil()),
        prop('prefix', str(faker.word.noun().toLowerCase() + ':'), { emptyLineBefore: true }),
        prop('ttl', int(faker.number.int({ min: 60, max: 86400 })), { trailingComment: comment('seconds') }),
        prop('max_retries', int(faker.number.int({ min: 1, max: 10 }))),
      ])),
    }),
    () => {
      const domain = faker.internet.domainName()
      return {
        title: 'Email Config',
        description: 'SMTP email service settings.',
        document: doc(obj([
          prop('smtp_host', str('smtp.' + domain)),
          prop('smtp_port', int(faker.helpers.arrayElement([25, 465, 587]))),
          prop('use_tls', bool(true)),
          prop('from_name', str(faker.company.name())),
          prop('from_email', str('noreply@' + domain)),
          prop('max_batch_size', int(faker.number.int({ min: 50, max: 500 })), {
            emptyLineBefore: true,
            leadingComments: [comment('Rate limiting')],
          }),
          prop('retry_interval', int(faker.number.int({ min: 30, max: 300 }))),
        ])),
      }
    },
    () => ({
      title: 'Feature Flags',
      description: 'Application feature toggle configuration.',
      document: doc(obj([
        prop('enable_dark_mode', bool(true)),
        prop('enable_notifications', bool(faker.datatype.boolean())),
        prop('enable_analytics', bool(faker.datatype.boolean()), { trailingComment: comment('requires consent') }),
        prop('enable_beta_features', bool(false)),
        prop('maintenance_mode', bool(false), { emptyLineBefore: true }),
        prop('max_upload_mb', int(faker.number.int({ min: 5, max: 100 }))),
        prop('session_timeout', int(faker.number.int({ min: 300, max: 7200 })), { trailingComment: comment('seconds') }),
      ])),
    }),
    () => ({
      title: 'Build Config',
      description: 'Build tool configuration.',
      document: doc(obj([
        prop('entry', str(faker.helpers.arrayElement(['src/index.ts', 'src/main.js', 'lib/index.mjs']))),
        prop('outdir', str(faker.helpers.arrayElement(['dist', 'build', 'out']))),
        prop('format', str(faker.helpers.arrayElement(['esm', 'cjs', 'iife']))),
        prop('target', str(faker.helpers.arrayElement(['es2020', 'es2022', 'esnext']))),
        prop('minify', bool(faker.datatype.boolean()), { emptyLineBefore: true }),
        prop('sourcemap', bool(true)),
        prop('bundle', bool(true)),
        prop('splitting', bool(faker.datatype.boolean())),
      ])),
    }),
    () => ({
      title: 'DNS Config',
      description: 'DNS zone configuration.',
      document: doc(obj([
        prop('zone', str(faker.internet.domainName())),
        prop('ttl', int(faker.helpers.arrayElement([300, 600, 3600, 86400])), { trailingComment: comment('seconds') }),
        prop('nameservers', arr([
          elem(str('ns1.' + faker.internet.domainName())),
          elem(str('ns2.' + faker.internet.domainName())),
        ])),
        prop('soa_email', str('admin@' + faker.internet.domainName()), { emptyLineBefore: true }),
        prop('refresh', int(faker.helpers.arrayElement([3600, 7200, 14400]))),
        prop('retry', int(faker.helpers.arrayElement([600, 900, 1800]))),
        prop('expire', int(faker.helpers.arrayElement([604800, 1209600]))),
      ])),
    }),
    () => ({
      title: 'Proxy Config',
      description: 'Reverse proxy settings.',
      document: doc(obj([
        prop('listen', int(faker.helpers.arrayElement([80, 443, 8080, 8443]))),
        prop('server_name', str(faker.internet.domainName())),
        prop('upstream', str(faker.helpers.arrayElement(['http://localhost:', 'http://127.0.0.1:']) + faker.number.int({ min: 3000, max: 9000 }))),
        prop('ssl', bool(faker.datatype.boolean()), { emptyLineBefore: true, leadingComments: [comment('TLS settings')] }),
        prop('http2', bool(true)),
        prop('gzip', bool(true), { emptyLineBefore: true }),
        prop('gzip_min_length', int(faker.helpers.arrayElement([256, 512, 1024]))),
        prop('client_max_body', str(faker.number.int({ min: 1, max: 50 }) + 'mb')),
      ])),
    }),
    () => ({
      title: 'Linter Config',
      description: 'Code linter rule configuration.',
      document: doc(obj([
        prop('parser', str(faker.helpers.arrayElement(['typescript', 'babel', 'espree']))),
        prop('env', str(faker.helpers.arrayElement(['browser', 'node', 'es2024']))),
        prop('indent', int(faker.helpers.arrayElement([2, 4]))),
        prop('semicolons', bool(faker.datatype.boolean())),
        prop('quotes', str(faker.helpers.arrayElement(['single', 'double']))),
        prop('max_line_length', int(faker.helpers.arrayElement([80, 100, 120])), {
          emptyLineBefore: true,
          leadingComments: [comment('Formatting')],
        }),
        prop('trailing_comma', str(faker.helpers.arrayElement(['all', 'es5', 'none']))),
        prop('no_unused_vars', bool(true), { trailingComment: comment('error') }),
        prop('no_console', bool(faker.datatype.boolean()), { trailingComment: comment('warn') }),
      ])),
    }),
    () => ({
      title: 'S3 Config',
      description: 'Object storage bucket configuration.',
      document: doc(obj([
        prop('bucket', str(faker.word.noun().toLowerCase() + '-' + faker.helpers.arrayElement(['assets', 'uploads', 'backups', 'logs']))),
        prop('region', str(faker.helpers.arrayElement(['us-east-1', 'eu-west-1', 'ap-southeast-1']))),
        prop('endpoint', str('https://s3.' + faker.helpers.arrayElement(['us-east-1', 'eu-west-1']) + '.amazonaws.com')),
        prop('access_key', str(faker.string.alphanumeric(20).toUpperCase()), { emptyLineBefore: true }),
        prop('secret_key', str(faker.string.alphanumeric(40))),
        prop('public', bool(false), { emptyLineBefore: true }),
        prop('versioning', bool(faker.datatype.boolean())),
        prop('max_upload_size', str(faker.number.int({ min: 10, max: 500 }) + 'mb')),
      ])),
    }),
    () => ({
      title: 'Logger Config',
      description: 'Structured logging configuration.',
      document: doc(obj([
        prop('level', str(faker.helpers.arrayElement(['trace', 'debug', 'info', 'warn', 'error', 'fatal']))),
        prop('format', str(faker.helpers.arrayElement(['json', 'pretty', 'logfmt']))),
        prop('timestamp', bool(true)),
        prop('caller', bool(faker.datatype.boolean()), { trailingComment: comment('include file:line') }),
        prop('output', str(faker.helpers.arrayElement(['stdout', 'stderr', '/var/log/app.log'])), { emptyLineBefore: true }),
        prop('rotation', bool(faker.datatype.boolean())),
        prop('max_size_mb', int(faker.number.int({ min: 10, max: 500 }))),
        prop('max_age_days', int(faker.number.int({ min: 7, max: 90 }))),
        prop('compress', bool(true)),
      ])),
    }),
    () => ({
      title: 'Git Config',
      description: 'Git client configuration.',
      document: doc(obj([
        prop('user_name', str(faker.person.fullName())),
        prop('user_email', str(faker.internet.email())),
        prop('default_branch', str(faker.helpers.arrayElement(['main', 'master', 'trunk']))),
        prop('auto_crlf', bool(false)),
        prop('editor', str(faker.helpers.arrayElement(['vim', 'nvim', 'nano', 'code --wait'])), { emptyLineBefore: true }),
        prop('gpg_sign', bool(faker.datatype.boolean())),
        prop('pull_rebase', bool(true)),
        prop('push_autosetup', bool(true)),
      ])),
    }),
    () => ({
      title: 'SSH Config',
      description: 'SSH client host configuration.',
      document: doc(obj([
        prop('host', str(faker.helpers.arrayElement(['production', 'staging', 'bastion', 'dev-server']))),
        prop('hostname', str(faker.internet.ipv4())),
        prop('user', str(faker.internet.username().toLowerCase())),
        prop('port', int(faker.helpers.arrayElement([22, 2222, 2200]))),
        prop('identity_file', str('~/.ssh/' + faker.helpers.arrayElement(['id_ed25519', 'id_rsa', 'deploy_key']))),
        prop('forward_agent', bool(faker.datatype.boolean()), { emptyLineBefore: true }),
        prop('server_alive_interval', int(faker.helpers.arrayElement([30, 60, 120]))),
        prop('compression', bool(true)),
      ])),
    }),
    () => ({
      title: 'Cron Schedule',
      description: 'Task scheduler timing configuration.',
      document: doc(obj([
        prop('timezone', str(faker.helpers.arrayElement(['UTC', 'America/New_York', 'Europe/Berlin', 'Asia/Tokyo']))),
        prop('backup', str('0 2 * * *'), { trailingComment: comment('daily at 2am') }),
        prop('cleanup', str('0 */6 * * *'), { trailingComment: comment('every 6 hours') }),
        prop('report', str('0 9 * * 1'), { trailingComment: comment('Monday 9am') }),
        prop('healthcheck', str('*/5 * * * *'), { trailingComment: comment('every 5 min') }),
        prop('rotate_logs', str('0 0 1 * *'), {
          emptyLineBefore: true,
          trailingComment: comment('first of month'),
        }),
        prop('sync', str('30 * * * *'), { trailingComment: comment('every hour at :30') }),
      ])),
    }),
    () => ({
      title: 'Locale Config',
      description: 'Regional and locale settings.',
      document: doc(obj([
        prop('language', str(faker.helpers.arrayElement(['en', 'fr', 'de', 'ja', 'es', 'pt', 'zh']))),
        prop('country', str(faker.location.countryCode())),
        prop('timezone', str(faker.location.timeZone())),
        prop('currency', str(faker.finance.currencyCode())),
        prop('date_format', str(faker.helpers.arrayElement(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'])), { emptyLineBefore: true }),
        prop('time_format', str(faker.helpers.arrayElement(['24h', '12h']))),
        prop('first_day_of_week', str(faker.helpers.arrayElement(['monday', 'sunday']))),
        prop('decimal_separator', str(faker.helpers.arrayElement(['.', ',']))),
      ])),
    }),
  ]
  return faker.helpers.arrayElement(templates)()
}

// ---------------------------------------------------------------------------
// Shape 2: Nested Object
// ---------------------------------------------------------------------------

function generateNestedObject() {
  const templates = [
    () => ({
      title: 'Cloud Deploy Config',
      description: 'Cloud deployment infrastructure configuration.',
      document: doc(obj([
        prop('provider', str(faker.helpers.arrayElement(['aws', 'gcp', 'azure', 'digitalocean']))),
        prop('region', str(faker.helpers.arrayElement(['us-east-1', 'eu-west-1', 'ap-southeast-1', 'us-west-2']))),
        prop('compute', obj([
          prop('instance_type', str(faker.helpers.arrayElement(['t3.medium', 'e2-standard-4', 'Standard_B2s']))),
          prop('count', int(faker.number.int({ min: 1, max: 10 }))),
          prop('auto_scaling', obj([
            prop('enabled', bool(true)),
            prop('min', int(faker.number.int({ min: 1, max: 3 }))),
            prop('max', int(faker.number.int({ min: 5, max: 20 }))),
            prop('target_cpu', int(faker.number.int({ min: 50, max: 80 }))),
          ])),
        ]), { emptyLineBefore: true, leadingComments: [comment('Compute resources')] }),
        prop('storage', obj([
          prop('type', str(faker.helpers.arrayElement(['ssd', 'hdd', 'nvme']))),
          prop('size_gb', int(faker.number.int({ min: 20, max: 500 }))),
          prop('encrypted', bool(true)),
        ]), { emptyLineBefore: true }),
        prop('networking', obj([
          prop('vpc', str('vpc-' + faker.string.hexadecimal({ length: 8, prefix: '' }).toLowerCase())),
          prop('subnet', str('10.' + faker.number.int({ min: 0, max: 255 }) + '.0.0/16')),
          prop('public_ip', bool(faker.datatype.boolean())),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'CI Pipeline',
      description: 'Continuous integration pipeline definition.',
      document: doc(obj([
        prop('name', str(faker.helpers.arrayElement(['Build & Test', 'CI Pipeline', 'Main Pipeline']))),
        prop('trigger', obj([
          prop('branches', arr([elem(str('main')), elem(str('develop'))])),
          prop('paths', arr([elem(str('src/**')), elem(str('tests/**'))])),
        ])),
        prop('stages', obj([
          prop('lint', obj([
            prop('image', str('node:' + faker.helpers.arrayElement(['18', '20', '22']))),
            prop('command', str(faker.helpers.arrayElement(['npm run lint', 'npx eslint .', 'npx biome check']))),
          ]), { leadingComments: [comment('Code quality')] }),
          prop('test', obj([
            prop('image', str('node:' + faker.helpers.arrayElement(['18', '20', '22']))),
            prop('command', str(faker.helpers.arrayElement(['npm test', 'npx vitest', 'npx jest']))),
            prop('coverage', bool(true)),
          ])),
          prop('build', obj([
            prop('image', str('node:' + faker.helpers.arrayElement(['18', '20', '22']))),
            prop('command', str('npm run build')),
            prop('artifacts', arr([elem(str('dist/**')), elem(str('build/**'))])),
          ])),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => {
      const primaryColor = faker.color.rgb()
      return {
        title: 'Theme Config',
        description: 'Design system theme configuration.',
        document: doc(obj([
          prop('name', str(faker.word.adjective() + ' Theme')),
          prop('colors', obj([
            prop('primary', str(primaryColor)),
            prop('secondary', str(faker.color.rgb())),
            prop('accent', str(faker.color.rgb())),
            prop('background', str(faker.helpers.arrayElement(['#ffffff', '#f8f9fa', '#0d1117']))),
            prop('text', str(faker.helpers.arrayElement(['#1a1a1a', '#333333', '#e6edf3']))),
            prop('error', str('#dc3545'), { emptyLineBefore: true }),
            prop('warning', str('#ffc107')),
            prop('success', str('#28a745')),
          ]), { leadingComments: [comment('Color palette')] }),
          prop('typography', obj([
            prop('font_family', str(faker.helpers.arrayElement([
              'Inter, sans-serif', 'system-ui, sans-serif', '"JetBrains Mono", monospace',
            ]))),
            prop('base_size', int(faker.helpers.arrayElement([14, 16, 18]))),
            prop('line_height', float(faker.helpers.arrayElement([1.5, 1.6, 1.75]))),
            prop('headings', obj([
              prop('font_family', str(faker.helpers.arrayElement([
                '"Playfair Display", serif', 'Inter, sans-serif', '"Space Grotesk", sans-serif',
              ]))),
              prop('weight', int(faker.helpers.arrayElement([600, 700, 800]))),
            ])),
          ]), { emptyLineBefore: true, leadingComments: [comment('Typography')] }),
          prop('spacing', obj([
            prop('unit', int(faker.helpers.arrayElement([4, 8]))),
            prop('scale', arr([
              elem(int(0)), elem(int(4)), elem(int(8)), elem(int(16)), elem(int(24)), elem(int(32)), elem(int(48)),
            ])),
          ]), { emptyLineBefore: true }),
          prop('border_radius', int(faker.helpers.arrayElement([4, 6, 8, 12]))),
        ])),
      }
    },
    () => ({
      title: 'Monitoring Config',
      description: 'Application monitoring and alerting setup.',
      document: doc(obj([
        prop('service', str(faker.company.buzzNoun().toLowerCase())),
        prop('metrics', obj([
          prop('endpoint', str('/metrics')),
          prop('interval', int(faker.helpers.arrayElement([10, 15, 30, 60])), { trailingComment: comment('seconds') }),
          prop('labels', obj([
            prop('env', str(faker.helpers.arrayElement(['prod', 'staging']))),
            prop('region', str(faker.helpers.arrayElement(['us-east', 'eu-west', 'ap-south']))),
            prop('team', str(faker.commerce.department().toLowerCase())),
          ])),
        ]), { leadingComments: [comment('Prometheus metrics')] }),
        prop('alerts', obj([
          prop('cpu_threshold', int(faker.number.int({ min: 70, max: 95 }))),
          prop('memory_threshold', int(faker.number.int({ min: 75, max: 95 }))),
          prop('latency_p99_ms', int(faker.number.int({ min: 100, max: 2000 }))),
          prop('error_rate', float(faker.helpers.arrayElement([0.01, 0.02, 0.05]))),
          prop('notification', obj([
            prop('channel', str(faker.helpers.arrayElement(['#ops-alerts', '#oncall', '#incidents']))),
            prop('severity', str(faker.helpers.arrayElement(['critical', 'warning', 'info']))),
          ])),
        ]), { emptyLineBefore: true, leadingComments: [comment('Alert thresholds')] }),
      ])),
    }),
    () => ({
      title: 'Auth Config',
      description: 'Authentication and authorization settings.',
      document: doc(obj([
        prop('provider', str(faker.helpers.arrayElement(['oauth2', 'oidc', 'saml', 'jwt']))),
        prop('jwt', obj([
          prop('secret_key', str(faker.string.alphanumeric(32))),
          prop('algorithm', str(faker.helpers.arrayElement(['HS256', 'RS256', 'ES256']))),
          prop('expiry', str(faker.helpers.arrayElement(['15m', '1h', '24h', '7d']))),
          prop('refresh_expiry', str(faker.helpers.arrayElement(['7d', '30d', '90d']))),
        ]), { leadingComments: [comment('Token settings')] }),
        prop('oauth', obj([
          prop('client_id', str(faker.string.alphanumeric(24))),
          prop('authorize_url', str('https://auth.' + faker.internet.domainName() + '/authorize')),
          prop('token_url', str('https://auth.' + faker.internet.domainName() + '/token')),
          prop('scopes', arr([
            elem(str('openid')), elem(str('profile')), elem(str('email')),
          ])),
        ]), { emptyLineBefore: true, leadingComments: [comment('OAuth provider')] }),
        prop('session', obj([
          prop('store', str(faker.helpers.arrayElement(['redis', 'memory', 'database']))),
          prop('cookie_name', str('sid')),
          prop('secure', bool(true)),
          prop('http_only', bool(true)),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'K8s Deployment',
      description: 'Kubernetes deployment specification.',
      document: doc(obj([
        prop('apiVersion', str('apps/v1')),
        prop('kind', str('Deployment')),
        prop('metadata', obj([
          prop('name', str(faker.word.noun().toLowerCase() + '-' + faker.helpers.arrayElement(['api', 'web', 'worker']))),
          prop('namespace', str(faker.helpers.arrayElement(['default', 'production', 'staging']))),
          prop('labels', obj([
            prop('app', str(faker.word.noun().toLowerCase())),
            prop('tier', str(faker.helpers.arrayElement(['frontend', 'backend', 'data']))),
          ])),
        ])),
        prop('spec', obj([
          prop('replicas', int(faker.number.int({ min: 1, max: 5 }))),
          prop('container', obj([
            prop('image', str(faker.word.noun().toLowerCase() + ':' + faker.system.semver())),
            prop('port', int(faker.helpers.arrayElement([3000, 8080, 8000, 9090]))),
            prop('resources', obj([
              prop('cpu_limit', str(faker.helpers.arrayElement(['250m', '500m', '1000m']))),
              prop('memory_limit', str(faker.helpers.arrayElement(['256Mi', '512Mi', '1Gi']))),
            ])),
          ])),
          prop('health_check', obj([
            prop('path', str(faker.helpers.arrayElement(['/health', '/healthz', '/ready']))),
            prop('interval', int(faker.helpers.arrayElement([10, 15, 30]))),
            prop('timeout', int(faker.helpers.arrayElement([3, 5, 10]))),
          ]), { emptyLineBefore: true }),
        ]), { emptyLineBefore: true, leadingComments: [comment('Deployment spec')] }),
      ])),
    }),
    () => ({
      title: 'API Gateway',
      description: 'API gateway routing and middleware configuration.',
      document: doc(obj([
        prop('gateway', obj([
          prop('host', str('api.' + faker.internet.domainName())),
          prop('port', int(faker.helpers.arrayElement([443, 8443]))),
          prop('protocol', str('https')),
        ])),
        prop('rate_limit', obj([
          prop('enabled', bool(true)),
          prop('window', str(faker.helpers.arrayElement(['1m', '5m', '15m']))),
          prop('max_requests', int(faker.number.int({ min: 100, max: 10000 }))),
          prop('by', str(faker.helpers.arrayElement(['ip', 'api_key', 'user']))),
        ]), { emptyLineBefore: true, leadingComments: [comment('Rate limiting')] }),
        prop('cors', obj([
          prop('enabled', bool(true)),
          prop('origins', arr([
            elem(str('https://' + faker.internet.domainName())),
            elem(str('https://app.' + faker.internet.domainName())),
          ])),
          prop('methods', arr([
            elem(str('GET')), elem(str('POST')), elem(str('PUT')), elem(str('DELETE')),
          ])),
          prop('max_age', int(faker.helpers.arrayElement([3600, 7200, 86400]))),
        ]), { emptyLineBefore: true, leadingComments: [comment('CORS policy')] }),
        prop('cache', obj([
          prop('enabled', bool(faker.datatype.boolean())),
          prop('ttl', int(faker.number.int({ min: 60, max: 3600 }))),
          prop('store', str(faker.helpers.arrayElement(['redis', 'memory']))),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Search Config',
      description: 'Search engine index configuration.',
      document: doc(obj([
        prop('engine', str(faker.helpers.arrayElement(['elasticsearch', 'meilisearch', 'typesense', 'algolia']))),
        prop('connection', obj([
          prop('host', str(faker.helpers.arrayElement(['localhost', 'search.internal']) + ':' + faker.helpers.arrayElement([7700, 9200, 8108]))),
          prop('api_key', str(faker.string.alphanumeric(32))),
          prop('timeout', int(faker.number.int({ min: 1000, max: 10000 }))),
        ])),
        prop('index', obj([
          prop('name', str(faker.word.noun().toLowerCase())),
          prop('primary_key', str('id')),
          prop('searchable', arr([
            elem(str('title')), elem(str('description')), elem(str('content')),
          ])),
          prop('filterable', arr([
            elem(str('category')), elem(str('status')), elem(str('date')),
          ])),
          prop('sortable', arr([
            elem(str('date')), elem(str('relevance')),
          ])),
        ]), { emptyLineBefore: true, leadingComments: [comment('Index settings')] }),
        prop('synonyms', obj([
          prop('js', arr([elem(str('javascript')), elem(str('ecmascript'))])),
          prop('ts', arr([elem(str('typescript'))])),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Queue Config',
      description: 'Message queue and worker configuration.',
      document: doc(obj([
        prop('broker', str(faker.helpers.arrayElement(['rabbitmq', 'kafka', 'sqs', 'redis']))),
        prop('connection', obj([
          prop('host', str(faker.helpers.arrayElement(['localhost', 'mq.internal']))),
          prop('port', int(faker.helpers.arrayElement([5672, 9092, 6379]))),
          prop('vhost', str(faker.helpers.arrayElement(['/', '/production', '/staging']))),
        ])),
        prop('queues', obj([
          prop('default', obj([
            prop('concurrency', int(faker.number.int({ min: 1, max: 10 }))),
            prop('retry', int(faker.number.int({ min: 1, max: 5 }))),
            prop('timeout', int(faker.number.int({ min: 5000, max: 60000 })), { trailingComment: comment('ms') }),
          ])),
          prop('priority', obj([
            prop('concurrency', int(faker.number.int({ min: 5, max: 20 }))),
            prop('retry', int(faker.number.int({ min: 3, max: 10 }))),
            prop('timeout', int(faker.number.int({ min: 1000, max: 10000 })), { trailingComment: comment('ms') }),
          ]), { emptyLineBefore: true }),
        ]), { emptyLineBefore: true, leadingComments: [comment('Queue definitions')] }),
        prop('dead_letter', obj([
          prop('enabled', bool(true)),
          prop('max_retries', int(faker.number.int({ min: 3, max: 10 }))),
          prop('queue', str('dead-letter')),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Backup Strategy',
      description: 'Backup schedule and retention policy.',
      document: doc(obj([
        prop('source', obj([
          prop('type', str(faker.helpers.arrayElement(['postgresql', 'mysql', 'mongodb', 'filesystem']))),
          prop('host', str(faker.helpers.arrayElement(['db.internal', 'localhost', 'primary.db.internal']))),
          prop('databases', arr([
            elem(str(faker.word.noun().toLowerCase())),
            elem(str(faker.word.noun().toLowerCase())),
          ])),
        ])),
        prop('schedule', obj([
          prop('full', str('0 2 * * 0'), { trailingComment: comment('weekly Sunday 2am') }),
          prop('incremental', str('0 2 * * 1-6'), { trailingComment: comment('daily except Sunday') }),
          prop('snapshot', str('0 */4 * * *'), { trailingComment: comment('every 4 hours') }),
        ]), { emptyLineBefore: true, leadingComments: [comment('Backup schedule')] }),
        prop('retention', obj([
          prop('daily', int(faker.number.int({ min: 7, max: 14 }))),
          prop('weekly', int(faker.number.int({ min: 4, max: 12 }))),
          prop('monthly', int(faker.number.int({ min: 6, max: 24 }))),
        ]), { emptyLineBefore: true }),
        prop('destination', obj([
          prop('type', str(faker.helpers.arrayElement(['s3', 'gcs', 'local', 'sftp']))),
          prop('path', str(faker.helpers.arrayElement([
            's3://backups-' + faker.word.noun().toLowerCase(),
            '/mnt/backups/' + faker.word.noun().toLowerCase(),
          ]))),
          prop('encryption', bool(true)),
          prop('compression', str(faker.helpers.arrayElement(['gzip', 'zstd', 'lz4']))),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => {
      const domain = faker.internet.domainName()
      return {
        title: 'Email Routing',
        description: 'Email routing and filtering rules.',
        document: doc(obj([
          prop('domain', str(domain)),
          prop('inbound', obj([
            prop('mx_records', arr([
              elem(str('mx1.' + domain)),
              elem(str('mx2.' + domain)),
            ])),
            prop('spam_filter', obj([
              prop('enabled', bool(true)),
              prop('threshold', float(faker.helpers.arrayElement([5.0, 7.0, 8.5]))),
              prop('action', str(faker.helpers.arrayElement(['quarantine', 'reject', 'tag']))),
            ])),
            prop('dkim', obj([
              prop('enabled', bool(true)),
              prop('selector', str('default')),
              prop('key_size', int(faker.helpers.arrayElement([1024, 2048]))),
            ]), { emptyLineBefore: true }),
          ])),
          prop('outbound', obj([
            prop('relay', str('smtp.' + domain)),
            prop('port', int(faker.helpers.arrayElement([25, 465, 587]))),
            prop('tls', bool(true)),
            prop('rate_limit', obj([
              prop('per_minute', int(faker.number.int({ min: 50, max: 500 }))),
              prop('per_hour', int(faker.number.int({ min: 1000, max: 10000 }))),
            ])),
          ]), { emptyLineBefore: true }),
        ])),
      }
    },
    () => ({
      title: 'Terraform Resource',
      description: 'Infrastructure as code resource definition.',
      document: doc(obj([
        prop('provider', str(faker.helpers.arrayElement(['aws', 'google', 'azurerm', 'digitalocean']))),
        prop('region', str(faker.helpers.arrayElement(['us-east-1', 'eu-west-1', 'asia-southeast1']))),
        prop('resources', obj([
          prop('vpc', obj([
            prop('cidr_block', str('10.' + faker.number.int({ min: 0, max: 255 }) + '.0.0/16')),
            prop('enable_dns', bool(true)),
            prop('tags', obj([
              prop('Name', str(faker.word.noun().toLowerCase() + '-vpc')),
              prop('Environment', str(faker.helpers.arrayElement(['production', 'staging']))),
            ])),
          ]), { leadingComments: [comment('Network')] }),
          prop('instance', obj([
            prop('ami', str('ami-' + faker.string.hexadecimal({ length: 8, prefix: '' }).toLowerCase())),
            prop('type', str(faker.helpers.arrayElement(['t3.micro', 't3.small', 't3.medium', 'm5.large']))),
            prop('key_name', str(faker.word.noun().toLowerCase() + '-key')),
            prop('monitoring', bool(true)),
            prop('root_volume', obj([
              prop('size', int(faker.helpers.arrayElement([20, 50, 100]))),
              prop('type', str(faker.helpers.arrayElement(['gp3', 'gp2', 'io1']))),
              prop('encrypted', bool(true)),
            ])),
          ]), { emptyLineBefore: true, leadingComments: [comment('Compute')] }),
          prop('security_group', obj([
            prop('name', str('allow-' + faker.helpers.arrayElement(['web', 'ssh', 'all']))),
            prop('ingress_port', int(faker.helpers.arrayElement([22, 80, 443, 8080]))),
            prop('ingress_cidr', str('0.0.0.0/0')),
          ]), { emptyLineBefore: true, leadingComments: [comment('Security')] }),
        ])),
      ])),
    }),
    () => ({
      title: 'GraphQL Schema',
      description: 'GraphQL type and resolver configuration.',
      document: doc(obj([
        prop('schema', obj([
          prop('query', str('Query')),
          prop('mutation', str('Mutation')),
        ])),
        prop('types', obj([
          prop('User', obj([
            prop('fields', obj([
              prop('id', str('ID!')),
              prop('name', str('String!')),
              prop('email', str('String!')),
              prop('avatar', str('String')),
              prop('posts', str('[Post!]!')),
              prop('role', str('Role!')),
            ])),
          ]), { leadingComments: [comment('User type')] }),
          prop('Post', obj([
            prop('fields', obj([
              prop('id', str('ID!')),
              prop('title', str('String!')),
              prop('body', str('String!')),
              prop('author', str('User!')),
              prop('published', str('Boolean!')),
              prop('created_at', str('DateTime!')),
            ])),
          ]), { emptyLineBefore: true, leadingComments: [comment('Post type')] }),
        ]), { emptyLineBefore: true }),
        prop('resolvers', obj([
          prop('cache', bool(true)),
          prop('max_depth', int(faker.number.int({ min: 5, max: 15 }))),
          prop('max_complexity', int(faker.number.int({ min: 100, max: 1000 }))),
        ]), { emptyLineBefore: true }),
      ])),
    }),
  ]
  return faker.helpers.arrayElement(templates)()
}

// ---------------------------------------------------------------------------
// Shape 3: Table Array
// ---------------------------------------------------------------------------

function generateTableArray() {
  const templates = [
    () => {
      const count = faker.number.int({ min: 3, max: 8 })
      const users = Array.from({ length: count }, (_, i) => elem(obj([
        prop('id', int(i + 1)),
        prop('name', str(faker.person.fullName())),
        prop('email', str(faker.internet.email())),
        prop('role', str(faker.helpers.arrayElement(['admin', 'editor', 'viewer', 'moderator']))),
        prop('active', bool(faker.datatype.boolean())),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'User Directory',
        description: 'A list of user accounts with roles.',
        document: doc(obj([
          prop('users', arr(users)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 7 })
      const products = Array.from({ length: count }, (_, i) => elem(obj([
        prop('sku', str(faker.string.alphanumeric(8).toUpperCase())),
        prop('name', str(faker.commerce.productName())),
        prop('price', float(parseFloat(faker.commerce.price({ min: 5, max: 999 })))),
        prop('category', str(faker.commerce.department())),
        prop('in_stock', bool(faker.datatype.boolean())),
        prop('rating', float(parseFloat(faker.number.float({ min: 1, max: 5, fractionDigits: 1 }).toFixed(1)))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Product Catalog',
        description: 'E-commerce product listings.',
        document: doc(obj([
          prop('products', arr(products)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const servers = Array.from({ length: count }, (_, i) => elem(obj([
        prop('hostname', str(faker.helpers.arrayElement(['web', 'api', 'db', 'cache', 'worker', 'queue']) + '-' + faker.number.int({ min: 1, max: 9 }))),
        prop('ip', str(faker.internet.ipv4())),
        prop('os', str(faker.helpers.arrayElement(['Ubuntu 22.04', 'Debian 12', 'Alpine 3.19', 'Amazon Linux 2023']))),
        prop('cpu_cores', int(faker.helpers.arrayElement([2, 4, 8, 16]))),
        prop('memory_gb', int(faker.helpers.arrayElement([4, 8, 16, 32, 64]))),
        prop('status', str(faker.helpers.arrayElement(['running', 'stopped', 'maintenance']))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Server Inventory',
        description: 'Infrastructure server inventory.',
        document: doc(obj([
          prop('servers', arr(servers)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const tasks = Array.from({ length: count }, (_, i) => elem(obj([
        prop('id', str(faker.string.alphanumeric(6).toUpperCase())),
        prop('title', str(faker.hacker.phrase())),
        prop('assignee', str(faker.person.fullName())),
        prop('priority', str(faker.helpers.arrayElement(['critical', 'high', 'medium', 'low']))),
        prop('status', str(faker.helpers.arrayElement(['todo', 'in_progress', 'review', 'done']))),
        prop('points', int(faker.helpers.arrayElement([1, 2, 3, 5, 8, 13]))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Sprint Board',
        description: 'Agile sprint task board.',
        document: doc(obj([
          prop('sprint', str('Sprint ' + faker.number.int({ min: 1, max: 50 }))),
          prop('tasks', arr(tasks)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 7 })
      const routes = Array.from({ length: count }, (_, i) => elem(obj([
        prop('method', str(faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']))),
        prop('path', str('/' + faker.helpers.arrayElement(['users', 'posts', 'comments', 'orders', 'products']) +
          (faker.datatype.boolean() ? '/:id' : ''))),
        prop('handler', str(faker.helpers.arrayElement(['list', 'create', 'update', 'delete', 'get']) +
          faker.helpers.arrayElement(['Users', 'Posts', 'Orders', 'Products']))),
        prop('auth', bool(faker.datatype.boolean())),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'API Routes',
        description: 'REST API route definitions.',
        document: doc(obj([
          prop('base_url', str('/api/v' + faker.number.int({ min: 1, max: 3 }))),
          prop('routes', arr(routes)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const deps = Array.from({ length: count }, (_, i) => elem(obj([
        prop('name', str(faker.helpers.arrayElement([
          'lodash', 'express', 'react', 'vue', 'axios', 'dayjs', 'zod', 'prisma', 'pino', 'fastify',
        ]))),
        prop('version', str(faker.system.semver())),
        prop('dev', bool(faker.datatype.boolean())),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Dependencies',
        description: 'Project dependency manifest.',
        document: doc(obj([
          prop('project', str(faker.word.noun().toLowerCase())),
          prop('dependencies', arr(deps)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const jobs = Array.from({ length: count }, (_, i) => elem(obj([
        prop('name', str(faker.helpers.arrayElement([
          'cleanup-temp', 'send-reports', 'sync-data', 'backup-db', 'refresh-cache', 'rotate-logs',
        ]))),
        prop('schedule', str(faker.helpers.arrayElement([
          '0 * * * *', '0 0 * * *', '*/15 * * * *', '0 2 * * 0', '30 6 * * 1-5',
        ]))),
        prop('command', str(faker.helpers.arrayElement([
          'node scripts/cleanup.js', 'python manage.py report', './bin/sync --all', 'pg_dump $DATABASE_URL',
        ]))),
        prop('enabled', bool(faker.datatype.boolean())),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Cron Jobs',
        description: 'Scheduled task definitions.',
        document: doc(obj([
          prop('timezone', str(faker.helpers.arrayElement(['UTC', 'America/New_York', 'Europe/London']))),
          prop('jobs', arr(jobs)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const roles = Array.from({ length: count }, (_, i) => elem(obj([
        prop('name', str(faker.helpers.arrayElement(['admin', 'editor', 'viewer', 'moderator', 'billing', 'support']))),
        prop('permissions', arr(
          faker.helpers.arrayElements(
            ['read', 'write', 'delete', 'manage_users', 'manage_billing', 'view_analytics', 'export_data'],
            { min: 2, max: 5 },
          ).map(p => elem(str(p)))
        )),
        prop('max_seats', faker.datatype.boolean() ? int(faker.number.int({ min: 1, max: 50 })) : nil()),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Roles & Permissions',
        description: 'Role-based access control definitions.',
        document: doc(obj([
          prop('roles', arr(roles)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const envVars = Array.from({ length: count }, (_, i) => elem(obj([
        prop('name', str(faker.helpers.arrayElement([
          'DATABASE_URL', 'REDIS_URL', 'API_KEY', 'SECRET_KEY', 'SENTRY_DSN', 'STRIPE_KEY',
          'AWS_ACCESS_KEY', 'SMTP_PASSWORD', 'JWT_SECRET', 'GITHUB_TOKEN',
        ]))),
        prop('required', bool(faker.datatype.boolean())),
        prop('secret', bool(faker.datatype.boolean())),
        prop('default', faker.datatype.boolean() ? str(faker.lorem.word()) : nil()),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Environment Vars',
        description: 'Environment variable definitions.',
        document: doc(obj([
          prop('app', str(faker.word.noun().toLowerCase())),
          prop('variables', arr(envVars)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 7 })
      const bookmarks = Array.from({ length: count }, (_, i) => elem(obj([
        prop('title', str(faker.lorem.sentence({ min: 3, max: 6 }))),
        prop('url', str(faker.internet.url())),
        prop('tags', arr(faker.helpers.arrayElements(
          ['dev', 'design', 'docs', 'tool', 'reference', 'tutorial', 'blog'],
          { min: 1, max: 3 },
        ).map(t => elem(str(t))))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Bookmarks',
        description: 'A curated list of bookmarked links.',
        document: doc(obj([
          prop('collection', str(faker.word.adjective() + ' ' + faker.word.noun())),
          prop('bookmarks', arr(bookmarks)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 4, max: 8 })
      const records = Array.from({ length: count }, (_, i) => elem(obj([
        prop('type', str(faker.helpers.arrayElement(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']))),
        prop('name', str(faker.helpers.arrayElement(['@', 'www', 'mail', 'api', 'cdn', '*', 'staging']))),
        prop('value', str(faker.helpers.arrayElement([
          faker.internet.ipv4(),
          faker.internet.domainName(),
          'v=spf1 include:_spf.' + faker.internet.domainName() + ' ~all',
        ]))),
        prop('ttl', int(faker.helpers.arrayElement([300, 3600, 86400]))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'DNS Records',
        description: 'DNS zone record entries.',
        document: doc(obj([
          prop('zone', str(faker.internet.domainName())),
          prop('records', arr(records)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 7 })
      const shortcuts = Array.from({ length: count }, (_, i) => elem(obj([
        prop('key', str(faker.helpers.arrayElement([
          'Ctrl+S', 'Ctrl+Shift+P', 'Cmd+K', 'Alt+F7', 'Ctrl+/', 'F5', 'Ctrl+Shift+F',
          'Cmd+Shift+L', 'Ctrl+D', 'Ctrl+`', 'Ctrl+B', 'Alt+Up',
        ]))),
        prop('action', str(faker.helpers.arrayElement([
          'save', 'command_palette', 'format', 'find_references', 'toggle_comment',
          'debug_run', 'search_project', 'select_all_occurrences', 'toggle_terminal', 'toggle_sidebar',
        ]))),
        prop('when', str(faker.helpers.arrayElement(['editor', 'terminal', 'global', 'debug']))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Keyboard Shortcuts',
        description: 'Editor keyboard shortcut bindings.',
        document: doc(obj([
          prop('editor', str(faker.helpers.arrayElement(['vscode', 'vim', 'emacs', 'sublime']))),
          prop('shortcuts', arr(shortcuts)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      const fonts = Array.from({ length: count }, (_, i) => elem(obj([
        prop('family', str(faker.helpers.arrayElement([
          'Inter', 'Roboto', 'JetBrains Mono', 'Fira Code', 'Source Sans Pro',
          'Noto Sans', 'IBM Plex Sans', 'Space Grotesk', 'Geist', 'Berkeley Mono',
        ]))),
        prop('category', str(faker.helpers.arrayElement(['sans-serif', 'serif', 'monospace', 'display']))),
        prop('weights', arr(
          faker.helpers.arrayElements([100, 200, 300, 400, 500, 600, 700, 800, 900], { min: 2, max: 5 })
            .sort((a, b) => a - b)
            .map(w => elem(int(w)))
        )),
        prop('variable', bool(faker.datatype.boolean())),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Font Stack',
        description: 'Typography font family definitions.',
        document: doc(obj([
          prop('fonts', arr(fonts)),
        ])),
      }
    },
    () => {
      const count = faker.number.int({ min: 4, max: 8 })
      const events = Array.from({ length: count }, (_, i) => elem(obj([
        prop('time', str(String(faker.number.int({ min: 8, max: 20 })).padStart(2, '0') + ':' +
          faker.helpers.arrayElement(['00', '15', '30', '45']))),
        prop('title', str(faker.lorem.sentence({ min: 3, max: 6 }))),
        prop('duration', str(faker.helpers.arrayElement(['15m', '30m', '45m', '1h', '1h30m', '2h']))),
        prop('location', str(faker.helpers.arrayElement([
          'Room ' + faker.string.alpha({ length: 1, casing: 'upper' }) + faker.number.int({ min: 1, max: 9 }),
          'Virtual', 'Main Hall', 'Lobby', faker.company.name() + ' HQ',
        ]))),
      ]), { emptyLineBefore: i > 0 }))
      return {
        title: 'Daily Agenda',
        description: 'A day schedule with timed events.',
        document: doc(obj([
          prop('date', str(faker.date.soon({ days: 14 }).toISOString().split('T')[0])),
          prop('events', arr(events)),
        ])),
      }
    },
  ]
  return faker.helpers.arrayElement(templates)()
}

// ---------------------------------------------------------------------------
// Shape 4: Mixed
// ---------------------------------------------------------------------------

function generateMixed() {
  const templates = [
    () => ({
      title: 'App Manifest',
      description: 'Full application manifest with metadata, dependencies, and scripts.',
      document: doc(obj([
        prop('name', str(faker.word.noun().toLowerCase() + '-' + faker.word.noun().toLowerCase())),
        prop('version', str(faker.system.semver())),
        prop('description', str(faker.company.catchPhrase())),
        prop('keywords', arr([
          elem(str(faker.word.noun())),
          elem(str(faker.word.noun())),
          elem(str(faker.word.adjective())),
        ]), { emptyLineBefore: true }),
        prop('scripts', obj([
          prop('dev', str('node server.js --watch')),
          prop('build', str('tsc && esbuild src/index.ts --bundle --outfile=dist/index.js')),
          prop('test', str(faker.helpers.arrayElement(['vitest', 'jest', 'mocha']))),
          prop('lint', str(faker.helpers.arrayElement(['eslint .', 'biome check', 'oxlint']))),
        ]), { emptyLineBefore: true }),
        prop('engines', obj([
          prop('node', str('>=' + faker.helpers.arrayElement(['18', '20', '22']))),
        ])),
        prop('author', obj([
          prop('name', str(faker.person.fullName())),
          prop('email', str(faker.internet.email())),
          prop('url', str(faker.internet.url())),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => {
      const count = faker.number.int({ min: 3, max: 6 })
      return {
        title: 'Recipe',
        description: 'A cooking recipe with ingredients and steps.',
        document: doc(obj([
          prop('title', str(faker.food.dish())),
          prop('servings', int(faker.number.int({ min: 2, max: 8 }))),
          prop('prep_time', str(faker.number.int({ min: 10, max: 60 }) + ' minutes')),
          prop('cook_time', str(faker.number.int({ min: 15, max: 120 }) + ' minutes')),
          prop('ingredients', arr(
            Array.from({ length: count }, () =>
              elem(str(faker.number.int({ min: 1, max: 4 }) + ' ' +
                faker.helpers.arrayElement(['cups', 'tbsp', 'tsp', 'oz', 'lbs', 'pieces']) + ' ' +
                faker.food.ingredient()))
            )
          ), { emptyLineBefore: true, leadingComments: [comment('Ingredients')] }),
          prop('steps', arr(
            Array.from({ length: faker.number.int({ min: 3, max: 7 }) }, (_, i) =>
              elem(str(faker.food.description())))
          ), { emptyLineBefore: true, leadingComments: [comment('Instructions')] }),
          prop('nutrition', obj([
            prop('calories', int(faker.number.int({ min: 150, max: 800 }))),
            prop('protein', str(faker.number.int({ min: 5, max: 50 }) + 'g')),
            prop('carbs', str(faker.number.int({ min: 10, max: 100 }) + 'g')),
            prop('fat', str(faker.number.int({ min: 5, max: 40 }) + 'g')),
          ]), { emptyLineBefore: true }),
        ])),
      }
    },
    () => ({
      title: 'Docker Compose',
      description: 'Multi-container application definition.',
      document: doc(obj([
        prop('version', str('3.8')),
        prop('services', obj([
          prop('app', obj([
            prop('image', str('node:' + faker.helpers.arrayElement(['18-alpine', '20-slim', '22']))),
            prop('ports', arr([elem(str(faker.number.int({ min: 3000, max: 4000 }) + ':' + faker.number.int({ min: 3000, max: 4000 })))])),
            prop('environment', obj([
              prop('NODE_ENV', str('production')),
              prop('DATABASE_URL', str('postgres://db:5432/' + faker.word.noun().toLowerCase())),
            ])),
            prop('depends_on', arr([elem(str('db')), elem(str('redis'))])),
          ])),
          prop('db', obj([
            prop('image', str(faker.helpers.arrayElement(['postgres:16', 'mysql:8', 'mariadb:11']))),
            prop('volumes', arr([elem(str('db_data:/var/lib/postgresql/data'))])),
            prop('environment', obj([
              prop('POSTGRES_DB', str(faker.word.noun().toLowerCase())),
              prop('POSTGRES_PASSWORD', str(faker.internet.password())),
            ])),
          ]), { emptyLineBefore: true }),
          prop('redis', obj([
            prop('image', str('redis:7-alpine')),
            prop('ports', arr([elem(str('6379:6379'))])),
          ]), { emptyLineBefore: true }),
        ])),
        prop('volumes', obj([
          prop('db_data', obj([])),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Blog Post',
      description: 'A blog post with metadata and content sections.',
      document: doc(obj([
        prop('title', str(faker.lorem.sentence({ min: 4, max: 8 }))),
        prop('slug', str(faker.lorem.slug())),
        prop('author', obj([
          prop('name', str(faker.person.fullName())),
          prop('avatar', str(faker.image.avatar())),
          prop('bio', str(faker.person.bio())),
        ])),
        prop('date', str(faker.date.recent({ days: 90 }).toISOString().split('T')[0])),
        prop('tags', arr([
          elem(str(faker.word.noun())),
          elem(str(faker.word.noun())),
          elem(str(faker.word.noun())),
        ])),
        prop('published', bool(faker.datatype.boolean()), { emptyLineBefore: true }),
        prop('reading_time', str(faker.number.int({ min: 3, max: 20 }) + ' min')),
        prop('summary', str(faker.lorem.paragraph())),
      ])),
    }),
    () => ({
      title: 'Notification Config',
      description: 'Multi-channel notification routing rules.',
      document: doc(obj([
        prop('channels', obj([
          prop('email', obj([
            prop('enabled', bool(true)),
            prop('provider', str(faker.helpers.arrayElement(['sendgrid', 'ses', 'mailgun', 'postmark']))),
            prop('from', str('notifications@' + faker.internet.domainName())),
          ])),
          prop('slack', obj([
            prop('enabled', bool(faker.datatype.boolean())),
            prop('webhook_url', str('https://hooks.slack.com/services/' + faker.string.alphanumeric(20))),
            prop('default_channel', str('#' + faker.helpers.arrayElement(['general', 'alerts', 'deployments']))),
          ]), { emptyLineBefore: true }),
          prop('sms', obj([
            prop('enabled', bool(false)),
            prop('provider', str(faker.helpers.arrayElement(['twilio', 'vonage', 'sns']))),
          ]), { emptyLineBefore: true }),
        ])),
        prop('rules', arr([
          elem(obj([
            prop('event', str('deploy_success')),
            prop('channels', arr([elem(str('slack')), elem(str('email'))])),
            prop('priority', str('low')),
          ])),
          elem(obj([
            prop('event', str('deploy_failure')),
            prop('channels', arr([elem(str('slack')), elem(str('email')), elem(str('sms'))])),
            prop('priority', str('critical')),
          ]), { emptyLineBefore: true }),
          elem(obj([
            prop('event', str('error_spike')),
            prop('channels', arr([elem(str('slack'))])),
            prop('priority', str('high')),
          ]), { emptyLineBefore: true }),
        ]), { emptyLineBefore: true, leadingComments: [comment('Routing rules')] }),
      ])),
    }),
    () => {
      const envs = ['dev', 'staging', 'prod']
      return {
        title: 'Migration Plan',
        description: 'Database migration plan across environments.',
        document: doc(obj([
          prop('schema_version', str(faker.system.semver())),
          prop('database', str(faker.helpers.arrayElement(['postgresql', 'mysql', 'sqlite']))),
          prop('migrations', arr(
            Array.from({ length: faker.number.int({ min: 3, max: 6 }) }, (_, i) => elem(obj([
              prop('id', str(String(Date.now() - (5 - i) * 86400000).slice(0, 10))),
              prop('name', str(faker.helpers.arrayElement(['create', 'add', 'alter', 'drop']) + '_' +
                faker.database.column() + '_' + faker.helpers.arrayElement(['table', 'index', 'column']))),
              prop('applied', bool(i < 3)),
            ]), { emptyLineBefore: i > 0 }))
          ), { emptyLineBefore: true }),
          prop('environments', obj(
            envs.map((env, i) => prop(env, obj([
              prop('host', str(env + '-db.' + faker.internet.domainName())),
              prop('port', int(5432)),
              prop('ssl', bool(env !== 'dev')),
            ]), { emptyLineBefore: i > 0 }))
          ), { emptyLineBefore: true }),
        ])),
      }
    },
    () => ({
      title: 'Webhook Config',
      description: 'Outgoing webhook endpoint configuration.',
      document: doc(obj([
        prop('name', str(faker.word.noun().toLowerCase() + '-hooks')),
        prop('secret', str(faker.string.alphanumeric(32))),
        prop('endpoints', arr([
          elem(obj([
            prop('url', str(faker.internet.url() + '/webhook')),
            prop('events', arr([elem(str('create')), elem(str('update')), elem(str('delete'))])),
            prop('active', bool(true)),
          ])),
          elem(obj([
            prop('url', str(faker.internet.url() + '/callback')),
            prop('events', arr([elem(str('payment.success')), elem(str('payment.failed'))])),
            prop('active', bool(faker.datatype.boolean())),
          ]), { emptyLineBefore: true }),
        ])),
        prop('retry', obj([
          prop('max_attempts', int(faker.number.int({ min: 3, max: 10 }))),
          prop('backoff', str(faker.helpers.arrayElement(['linear', 'exponential']))),
          prop('interval', int(faker.number.int({ min: 5, max: 60 })), { trailingComment: comment('seconds') }),
        ]), { emptyLineBefore: true }),
        prop('timeout', int(faker.number.int({ min: 5, max: 30 })), { trailingComment: comment('seconds') }),
      ])),
    }),
    () => ({
      title: 'Test Suite',
      description: 'Test runner configuration with coverage settings.',
      document: doc(obj([
        prop('runner', str(faker.helpers.arrayElement(['vitest', 'jest', 'mocha', 'ava']))),
        prop('root', str(faker.helpers.arrayElement(['./tests', './test', './src/__tests__']))),
        prop('include', arr([
          elem(str('**/*.test.ts')),
          elem(str('**/*.spec.ts')),
        ])),
        prop('exclude', arr([
          elem(str('node_modules')),
          elem(str('dist')),
          elem(str('**/*.e2e.ts')),
        ])),
        prop('coverage', obj([
          prop('enabled', bool(true)),
          prop('provider', str(faker.helpers.arrayElement(['v8', 'istanbul', 'c8']))),
          prop('thresholds', obj([
            prop('lines', int(faker.number.int({ min: 70, max: 95 }))),
            prop('branches', int(faker.number.int({ min: 60, max: 90 }))),
            prop('functions', int(faker.number.int({ min: 70, max: 95 }))),
          ])),
          prop('reporter', arr([elem(str('text')), elem(str('lcov')), elem(str('html'))])),
        ]), { emptyLineBefore: true, leadingComments: [comment('Coverage')] }),
        prop('globals', bool(faker.datatype.boolean())),
        prop('timeout', int(faker.number.int({ min: 5000, max: 30000 })), { trailingComment: comment('ms') }),
      ])),
    }),
    () => ({
      title: 'i18n Config',
      description: 'Internationalization and locale settings.',
      document: doc(obj([
        prop('default_locale', str(faker.helpers.arrayElement(['en', 'en-US', 'fr', 'de', 'ja']))),
        prop('fallback', str('en')),
        prop('locales', arr([
          elem(obj([
            prop('code', str('en')),
            prop('name', str('English')),
            prop('dir', str('ltr')),
          ])),
          elem(obj([
            prop('code', str('fr')),
            prop('name', str('Fran\u00e7ais')),
            prop('dir', str('ltr')),
          ]), { emptyLineBefore: true }),
          elem(obj([
            prop('code', str('ar')),
            prop('name', str('\u0627\u0644\u0639\u0631\u0628\u064a\u0629')),
            prop('dir', str('rtl')),
          ]), { emptyLineBefore: true }),
          elem(obj([
            prop('code', str('ja')),
            prop('name', str('\u65e5\u672c\u8a9e')),
            prop('dir', str('ltr')),
          ]), { emptyLineBefore: true }),
        ])),
        prop('detection', obj([
          prop('order', arr([elem(str('cookie')), elem(str('header')), elem(str('query'))])),
          prop('cookie_name', str('lang')),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Dashboard Layout',
      description: 'Dashboard widget layout configuration.',
      document: doc(obj([
        prop('title', str(faker.company.name() + ' Dashboard')),
        prop('refresh_interval', int(faker.helpers.arrayElement([30, 60, 300])), { trailingComment: comment('seconds') }),
        prop('widgets', arr([
          elem(obj([
            prop('type', str('chart')),
            prop('title', str(faker.helpers.arrayElement(['Revenue', 'Traffic', 'Signups', 'Active Users']))),
            prop('source', str(faker.helpers.arrayElement(['/api/metrics/revenue', '/api/metrics/traffic']))),
            prop('chart_type', str(faker.helpers.arrayElement(['line', 'bar', 'area']))),
            prop('period', str(faker.helpers.arrayElement(['7d', '30d', '90d']))),
          ])),
          elem(obj([
            prop('type', str('stat')),
            prop('title', str(faker.helpers.arrayElement(['Total Users', 'MRR', 'Uptime', 'Error Rate']))),
            prop('source', str(faker.helpers.arrayElement(['/api/stats/users', '/api/stats/revenue']))),
            prop('format', str(faker.helpers.arrayElement(['number', 'currency', 'percent']))),
          ]), { emptyLineBefore: true }),
          elem(obj([
            prop('type', str('table')),
            prop('title', str(faker.helpers.arrayElement(['Recent Orders', 'Latest Signups', 'Top Pages']))),
            prop('source', str(faker.helpers.arrayElement(['/api/recent/orders', '/api/recent/signups']))),
            prop('limit', int(faker.number.int({ min: 5, max: 25 }))),
          ]), { emptyLineBefore: true }),
        ])),
        prop('theme', str(faker.helpers.arrayElement(['light', 'dark', 'auto'])), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Game Config',
      description: 'Video game settings and preferences.',
      document: doc(obj([
        prop('display', obj([
          prop('resolution', str(faker.helpers.arrayElement(['1920x1080', '2560x1440', '3840x2160']))),
          prop('fullscreen', bool(faker.datatype.boolean())),
          prop('vsync', bool(true)),
          prop('fps_limit', int(faker.helpers.arrayElement([60, 120, 144, 240, 0]))),
        ])),
        prop('graphics', obj([
          prop('quality', str(faker.helpers.arrayElement(['low', 'medium', 'high', 'ultra']))),
          prop('shadows', str(faker.helpers.arrayElement(['off', 'low', 'medium', 'high']))),
          prop('anti_aliasing', str(faker.helpers.arrayElement(['none', 'FXAA', 'TAA', 'MSAA']))),
          prop('render_distance', int(faker.number.int({ min: 4, max: 32 }))),
          prop('ray_tracing', bool(faker.datatype.boolean())),
        ]), { emptyLineBefore: true }),
        prop('audio', obj([
          prop('master', int(faker.number.int({ min: 50, max: 100 }))),
          prop('music', int(faker.number.int({ min: 20, max: 100 }))),
          prop('sfx', int(faker.number.int({ min: 50, max: 100 }))),
          prop('voice', int(faker.number.int({ min: 50, max: 100 }))),
        ]), { emptyLineBefore: true }),
        prop('controls', obj([
          prop('sensitivity', float(parseFloat(faker.number.float({ min: 0.5, max: 5.0, fractionDigits: 1 }).toFixed(1)))),
          prop('invert_y', bool(false)),
          prop('vibration', bool(faker.datatype.boolean())),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => {
      const trackCount = faker.number.int({ min: 4, max: 8 })
      return {
        title: 'Playlist',
        description: 'A music playlist with tracks and metadata.',
        document: doc(obj([
          prop('name', str(faker.music.genre() + ' ' + faker.helpers.arrayElement(['Mix', 'Vibes', 'Essentials', 'Favorites']))),
          prop('curator', str(faker.person.fullName())),
          prop('public', bool(faker.datatype.boolean())),
          prop('tracks', arr(
            Array.from({ length: trackCount }, (_, i) => elem(obj([
              prop('title', str(faker.music.songName())),
              prop('artist', str(faker.person.fullName())),
              prop('album', str(faker.lorem.words({ min: 1, max: 3 }))),
              prop('duration', str(faker.number.int({ min: 2, max: 5 }) + ':' +
                String(faker.number.int({ min: 0, max: 59 })).padStart(2, '0'))),
            ]), { emptyLineBefore: i > 0 }))
          )),
          prop('total_duration', str(faker.number.int({ min: 20, max: 90 }) + 'min'), { emptyLineBefore: true }),
        ])),
      }
    },
    () => ({
      title: 'Travel Itinerary',
      description: 'A multi-day travel plan.',
      document: doc(obj([
        prop('trip', str(faker.location.city() + ' to ' + faker.location.city())),
        prop('traveler', str(faker.person.fullName())),
        prop('dates', obj([
          prop('departure', str(faker.date.soon({ days: 60 }).toISOString().split('T')[0])),
          prop('return', str(faker.date.soon({ days: 90 }).toISOString().split('T')[0])),
        ])),
        prop('flights', arr([
          elem(obj([
            prop('flight', str(faker.airline.flightNumber({ addLeadingZeros: true }))),
            prop('from', str(faker.airline.airport().iataCode)),
            prop('to', str(faker.airline.airport().iataCode)),
            prop('departure', str(faker.helpers.arrayElement(['06:30', '09:15', '14:00', '18:45']))),
            prop('seat', str(faker.airline.seat())),
          ])),
          elem(obj([
            prop('flight', str(faker.airline.flightNumber({ addLeadingZeros: true }))),
            prop('from', str(faker.airline.airport().iataCode)),
            prop('to', str(faker.airline.airport().iataCode)),
            prop('departure', str(faker.helpers.arrayElement(['07:00', '11:30', '16:20', '20:00']))),
            prop('seat', str(faker.airline.seat())),
          ]), { emptyLineBefore: true }),
        ]), { emptyLineBefore: true }),
        prop('hotel', obj([
          prop('name', str(faker.company.name() + ' Hotel')),
          prop('address', str(faker.location.streetAddress())),
          prop('check_in', str(faker.helpers.arrayElement(['14:00', '15:00', '16:00']))),
          prop('check_out', str(faker.helpers.arrayElement(['10:00', '11:00', '12:00']))),
          prop('confirmation', str(faker.string.alphanumeric(8).toUpperCase())),
        ]), { emptyLineBefore: true }),
      ])),
    }),
    () => ({
      title: 'Resume',
      description: 'A personal resume with experience and skills.',
      document: doc(obj([
        prop('name', str(faker.person.fullName())),
        prop('title', str(faker.person.jobTitle())),
        prop('email', str(faker.internet.email())),
        prop('location', str(faker.location.city() + ', ' + faker.location.country())),
        prop('summary', str(faker.person.bio())),
        prop('skills', arr(
          faker.helpers.arrayElements(
            ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'React', 'Node.js', 'PostgreSQL',
             'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Redis', 'Linux', 'Git'],
            { min: 4, max: 8 },
          ).map(s => elem(str(s)))
        ), { emptyLineBefore: true }),
        prop('experience', arr([
          elem(obj([
            prop('company', str(faker.company.name())),
            prop('role', str(faker.person.jobTitle())),
            prop('period', str(faker.date.past({ years: 5 }).getFullYear() + ' - Present')),
            prop('highlights', arr([
              elem(str(faker.lorem.sentence())),
              elem(str(faker.lorem.sentence())),
            ])),
          ])),
          elem(obj([
            prop('company', str(faker.company.name())),
            prop('role', str(faker.person.jobTitle())),
            prop('period', str(faker.date.past({ years: 8 }).getFullYear() + ' - ' + faker.date.past({ years: 4 }).getFullYear())),
            prop('highlights', arr([
              elem(str(faker.lorem.sentence())),
              elem(str(faker.lorem.sentence())),
            ])),
          ]), { emptyLineBefore: true }),
        ]), { emptyLineBefore: true }),
        prop('education', obj([
          prop('degree', str(faker.helpers.arrayElement(['BS Computer Science', 'MS Software Engineering', 'BA Mathematics', 'PhD Computer Science']))),
          prop('university', str(faker.company.name() + ' University')),
          prop('year', int(faker.number.int({ min: 2005, max: 2022 }))),
        ]), { emptyLineBefore: true }),
      ])),
    }),
  ]
  return faker.helpers.arrayElement(templates)()
}

// ---------------------------------------------------------------------------
// Shape 5: Feature Showcase
// ---------------------------------------------------------------------------

function generateShowcase() {
  const templates = [
    () => ({
      title: 'SQL Queries',
      description: 'Database queries stored as raw strings.',
      document: doc(obj([
        prop('name', str('user-reports')),
        prop('version', int(faker.number.int({ min: 1, max: 10 }))),
        prop('queries', obj([
          prop('find_active', raw(
            `SELECT u.id, u.name, u.email\nFROM users u\nWHERE u.active = true\n  AND u.created_at > '2024-01-01'\nORDER BY u.name`
          ), { leadingComments: [comment('Find all active users')] }),
          prop('monthly_stats', raw(
            `SELECT\n  DATE_TRUNC('month', created_at) AS month,\n  COUNT(*) AS total,\n  SUM(amount) AS revenue\nFROM orders\nGROUP BY month\nORDER BY month DESC`
          ), { emptyLineBefore: true, leadingComments: [comment('Monthly aggregation')] }),
        ]), { emptyLineBefore: true }),
      ]), [comment('Database query definitions')]),
    }),
    () => ({
      title: 'HTML Templates',
      description: 'Email HTML templates with raw string content.',
      document: doc(obj([
        prop('from', str('noreply@' + faker.internet.domainName())),
        prop('subject', str(faker.lorem.sentence({ min: 3, max: 6 }))),
        prop('template', raw(
          `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Welcome</title>\n</head>\n<body>\n  <h1>Hello, {{name}}!</h1>\n  <p>${faker.lorem.paragraph()}</p>\n  <a href="{{url}}">Get Started</a>\n</body>\n</html>`
        ), { leadingComments: [comment('HTML email body')] }),
        prop('plain_text', raw(
          `Hello, {{name}}!\n\n${faker.lorem.paragraph()}\n\nVisit: {{url}}`
        ), { emptyLineBefore: true, leadingComments: [comment('Plain text fallback')] }),
      ]), [comment('Email template configuration')]),
    }),
    () => ({
      title: 'Config with Comments',
      description: 'Heavily documented configuration file.',
      document: doc(obj([
        prop('app', obj([
          prop('name', str(faker.company.name()), { leadingComments: [comment('The display name shown in the UI')] }),
          prop('version', str(faker.system.semver()), { trailingComment: comment('semver') }),
          prop('description', str(faker.company.catchPhrase()), { leadingComments: [comment('Brief description for the about page')] }),
        ]), { leadingComments: [comment('Application metadata'), comment('These values are shown in the UI')] }),
        prop('server', obj([
          prop('host', str('0.0.0.0'), {
            trailingComment: comment('bind to all interfaces'),
          }),
          prop('port', int(faker.number.int({ min: 3000, max: 9000 })), {
            trailingComment: comment('default: 8080'),
          }),
          prop('workers', int(faker.number.int({ min: 1, max: 16 })), {
            leadingComments: [comment('Number of worker processes')],
            trailingComment: comment('set to 0 for auto'),
          }),
        ]), {
          emptyLineBefore: true,
          leadingComments: [comment('Server configuration')],
        }),
        prop('logging', obj([
          prop('level', str(faker.helpers.arrayElement(['debug', 'info', 'warn', 'error'])), {
            leadingComments: [comment('Valid levels: debug, info, warn, error')],
          }),
          prop('format', str(faker.helpers.arrayElement(['json', 'text'])), {
            trailingComment: comment('json recommended for production'),
          }),
          prop('output', str(faker.helpers.arrayElement(['stdout', '/var/log/app.log'])), {
            trailingComment: comment('file path or stdout'),
          }),
        ]), {
          emptyLineBefore: true,
          leadingComments: [comment('Logging settings')],
        }),
      ]), [comment('Application Configuration File'), comment('Generated by MAML examples')]),
    }),
    () => ({
      title: 'Quoted Keys',
      description: 'Configuration using special characters in keys.',
      document: doc(obj([
        prop('Content-Type', str(faker.helpers.arrayElement([
          'application/json', 'text/html', 'application/xml',
        ]))),
        prop('X-Request-ID', str(faker.string.uuid())),
        prop('Accept-Language', str(faker.helpers.arrayElement(['en-US', 'fr-FR', 'de-DE', 'ja-JP']))),
        prop('Cache-Control', str(faker.helpers.arrayElement([
          'no-cache', 'max-age=3600', 'public, max-age=86400',
        ]))),
        prop('X-Powered-By', str(faker.helpers.arrayElement(['Express', 'Fastify', 'Hono', 'Koa']))),
        prop('headers with spaces', obj([
          prop('custom header', str(faker.lorem.word())),
          prop('another one', str(faker.lorem.word())),
        ]), { emptyLineBefore: true, leadingComments: [comment('Keys with spaces get quoted')] }),
      ]), [comment('HTTP Headers')]),
    }),
    () => ({
      title: 'Changelog',
      description: 'Project changelog with raw string release notes.',
      document: doc(obj([
        prop('project', str(faker.word.noun().toLowerCase())),
        prop('releases', arr([
          elem(obj([
            prop('version', str(faker.system.semver())),
            prop('date', str(faker.date.recent({ days: 30 }).toISOString().split('T')[0])),
            prop('notes', raw(
              `Added:\n- ${faker.git.commitMessage()}\n- ${faker.git.commitMessage()}\n\nFixed:\n- ${faker.git.commitMessage()}`
            )),
          ])),
          elem(obj([
            prop('version', str(faker.system.semver())),
            prop('date', str(faker.date.recent({ days: 90 }).toISOString().split('T')[0])),
            prop('notes', raw(
              `Changed:\n- ${faker.git.commitMessage()}\n\nRemoved:\n- ${faker.git.commitMessage()}`
            )),
          ]), { emptyLineBefore: true }),
          elem(obj([
            prop('version', str(faker.system.semver())),
            prop('date', str(faker.date.recent({ days: 180 }).toISOString().split('T')[0])),
            prop('notes', raw(
              `Initial release:\n- ${faker.git.commitMessage()}\n- ${faker.git.commitMessage()}\n- ${faker.git.commitMessage()}`
            )),
          ]), { emptyLineBefore: true }),
        ])),
      ]), [comment(faker.word.noun().charAt(0).toUpperCase() + faker.word.noun().slice(1) + ' Changelog')]),
    }),
    () => ({
      title: 'Shell Scripts',
      description: 'Embedded shell scripts as raw strings.',
      document: doc(obj([
        prop('name', str(faker.helpers.arrayElement(['deploy', 'setup', 'backup', 'migrate']))),
        prop('shell', str(faker.helpers.arrayElement(['/bin/bash', '/bin/sh', '/usr/bin/env bash']))),
        prop('setup', raw(
          `#!/bin/bash\nset -euo pipefail\n\necho "Setting up environment..."\nnpm install\nnpm run build\necho "Done!"`
        ), { leadingComments: [comment('Initial setup script')] }),
        prop('deploy', raw(
          `#!/bin/bash\nset -euo pipefail\n\nVERSION=$(git describe --tags)\necho "Deploying $VERSION"\n\ndocker build -t app:$VERSION .\ndocker push app:$VERSION\nkubectl set image deployment/app app=app:$VERSION\n\necho "Deployed $VERSION successfully"`
        ), { emptyLineBefore: true, leadingComments: [comment('Deployment script')] }),
        prop('timeout', int(faker.number.int({ min: 30, max: 300 })), {
          emptyLineBefore: true,
          trailingComment: comment('seconds'),
        }),
        prop('retry', int(faker.number.int({ min: 1, max: 5 }))),
      ]), [comment('Automation scripts')]),
    }),
    () => ({
      title: 'Log Entries',
      description: 'Application log samples with raw multiline content.',
      document: doc(obj([
        prop('application', str(faker.company.buzzNoun().toLowerCase())),
        prop('log_format', str('structured')),
        prop('sample_error', raw(
          `Error: ${faker.hacker.phrase()}\n    at ${faker.system.filePath()}:${faker.number.int({ min: 1, max: 500 })}\n    at ${faker.system.filePath()}:${faker.number.int({ min: 1, max: 500 })}\n    at process.main (node:internal/main:1:1)`
        ), { leadingComments: [comment('Example stack trace')] }),
        prop('sample_request', raw(
          `${faker.helpers.arrayElement(['GET', 'POST', 'PUT'])} /api/${faker.word.noun()} HTTP/1.1\nHost: ${faker.internet.domainName()}\nUser-Agent: ${faker.internet.userAgent()}\nAccept: application/json`
        ), { emptyLineBefore: true, leadingComments: [comment('Sample HTTP request')] }),
        prop('retention_days', int(faker.number.int({ min: 7, max: 90 }))),
      ])),
    }),
    () => ({
      title: 'Nginx Snippet',
      description: 'Nginx server block as raw string configuration.',
      document: doc(obj([
        prop('name', str(faker.internet.domainName())),
        prop('config', raw(
          `server {\n    listen 443 ssl http2;\n    server_name ${faker.internet.domainName()};\n\n    ssl_certificate /etc/ssl/certs/cert.pem;\n    ssl_certificate_key /etc/ssl/private/key.pem;\n\n    location / {\n        proxy_pass http://localhost:${faker.number.int({ min: 3000, max: 9000 })};\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n    }\n\n    location /static/ {\n        root /var/www/html;\n        expires 30d;\n    }\n}`
        ), { leadingComments: [comment('Server block')] }),
        prop('enabled', bool(true), { emptyLineBefore: true }),
        prop('reload_command', str('nginx -t && systemctl reload nginx')),
      ]), [comment('Nginx configuration')]),
    }),
    () => ({
      title: 'Regex Patterns',
      description: 'Named regex patterns for validation.',
      document: doc(obj([
        prop('email', raw('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'), {
          trailingComment: comment('RFC 5322 simplified'),
        }),
        prop('phone', raw('^\\+?[1-9]\\d{1,14}$'), {
          trailingComment: comment('E.164 format'),
        }),
        prop('uuid', raw('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
        prop('slug', raw('^[a-z0-9]+(?:-[a-z0-9]+)*$')),
        prop('semver', raw('^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$'), {
          emptyLineBefore: true,
          leadingComments: [comment('Semantic versioning')],
        }),
        prop('ipv4', raw('^((25[0-5]|(2[0-4]|1\\d|[1-9]|)\\d)\\.?\\b){4}$')),
        prop('hex_color', raw('^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')),
        prop('url', raw('^https?://[^\\s/$.?#].[^\\s]*$'), {
          emptyLineBefore: true,
          leadingComments: [comment('URL patterns')],
        }),
      ]), [comment('Validation regex patterns')]),
    }),
    () => ({
      title: 'Error Messages',
      description: 'Application error messages with codes and descriptions.',
      document: doc(obj([
        prop('locale', str('en')),
        prop('errors', obj([
          prop('AUTH_FAILED', obj([
            prop('code', int(401)),
            prop('message', str('Authentication failed')),
            prop('detail', raw('Your credentials are invalid or expired.\nPlease sign in again or reset your password.')),
          ]), { leadingComments: [comment('Authentication errors')] }),
          prop('FORBIDDEN', obj([
            prop('code', int(403)),
            prop('message', str('Access denied')),
            prop('detail', raw('You do not have permission to access this resource.\nContact your administrator if you believe this is an error.')),
          ]), { emptyLineBefore: true }),
          prop('NOT_FOUND', obj([
            prop('code', int(404)),
            prop('message', str('Resource not found')),
            prop('detail', raw('The requested resource does not exist or has been removed.\nCheck the URL and try again.')),
          ]), { emptyLineBefore: true }),
          prop('RATE_LIMITED', obj([
            prop('code', int(429)),
            prop('message', str('Too many requests')),
            prop('detail', raw('You have exceeded the rate limit.\nPlease wait before making another request.')),
          ]), { emptyLineBefore: true, leadingComments: [comment('Rate limiting')] }),
          prop('INTERNAL', obj([
            prop('code', int(500)),
            prop('message', str('Internal server error')),
            prop('detail', raw('An unexpected error occurred.\nOur team has been notified and is investigating.')),
          ]), { emptyLineBefore: true }),
        ])),
      ]), [comment('Error message catalog')]),
    }),
    () => ({
      title: 'Makefile Targets',
      description: 'Build targets with embedded shell commands.',
      document: doc(obj([
        prop('project', str(faker.word.noun().toLowerCase())),
        prop('default', str('build')),
        prop('targets', obj([
          prop('build', obj([
            prop('deps', arr([elem(str('clean')), elem(str('lint'))])),
            prop('script', raw(`echo "Building..."\ngo build -o bin/app ./cmd/app\necho "Build complete"`)),
          ]), { leadingComments: [comment('Build the application')] }),
          prop('test', obj([
            prop('script', raw(`echo "Running tests..."\ngo test -v -race -coverprofile=coverage.out ./...\ngo tool cover -html=coverage.out -o coverage.html`)),
          ]), { emptyLineBefore: true, leadingComments: [comment('Run tests with coverage')] }),
          prop('clean', obj([
            prop('script', raw(`rm -rf bin/ dist/ coverage.out coverage.html\necho "Cleaned"`)),
          ]), { emptyLineBefore: true }),
          prop('docker', obj([
            prop('deps', arr([elem(str('build'))])),
            prop('script', raw(`docker build -t ${faker.word.noun().toLowerCase()}:latest .\ndocker push ${faker.word.noun().toLowerCase()}:latest`)),
          ]), { emptyLineBefore: true, leadingComments: [comment('Docker build and push')] }),
        ])),
      ]), [comment('Build targets')]),
    }),
    () => ({
      title: 'Git Hooks',
      description: 'Git hook scripts for pre-commit and pre-push.',
      document: doc(obj([
        prop('pre-commit', raw(
          `#!/bin/sh\nset -e\n\n# Run linter\nnpx eslint --fix .\n\n# Run type check\nnpx tsc --noEmit\n\n# Stage fixed files\ngit add -u`
        ), { leadingComments: [comment('Runs before each commit')] }),
        prop('pre-push', raw(
          `#!/bin/sh\nset -e\n\n# Run full test suite\nnpm test\n\n# Check for console.log\nif grep -rn "console\\.log" src/; then\n  echo "Error: console.log found"\n  exit 1\nfi`
        ), { emptyLineBefore: true, leadingComments: [comment('Runs before push to remote')] }),
        prop('commit-msg', raw(
          `#!/bin/sh\n# Enforce conventional commit format\nif ! head -1 "$1" | grep -qE "^(feat|fix|docs|style|refactor|test|chore)(\\(.+\\))?: .+"; then\n  echo "Error: Invalid commit message format"\n  echo "Use: type(scope): description"\n  exit 1\nfi`
        ), { emptyLineBefore: true, leadingComments: [comment('Validate commit message format')] }),
      ]), [comment('Git hooks configuration')]),
    }),
    () => ({
      title: 'API Mock',
      description: 'Mock API response payloads for testing.',
      document: doc(obj([
        prop('endpoint', str('/api/v1/users')),
        prop('method', str('GET')),
        prop('status', int(200)),
        prop('response', raw(
          `[\n  {\n    "id": 1,\n    "name": "${faker.person.fullName()}",\n    "email": "${faker.internet.email()}",\n    "role": "admin"\n  },\n  {\n    "id": 2,\n    "name": "${faker.person.fullName()}",\n    "email": "${faker.internet.email()}",\n    "role": "user"\n  }\n]`
        ), { leadingComments: [comment('JSON response body')] }),
        prop('headers', obj([
          prop('Content-Type', str('application/json')),
          prop('X-Total-Count', str('2')),
          prop('X-Request-Id', str(faker.string.uuid())),
        ]), { emptyLineBefore: true, leadingComments: [comment('Response headers')] }),
        prop('delay_ms', int(faker.number.int({ min: 50, max: 500 })), { trailingComment: comment('simulated latency') }),
      ]), [comment('Mock API definition')]),
    }),
    () => ({
      title: 'License Header',
      description: 'Source file license headers as raw strings.',
      document: doc(obj([
        prop('mit', raw(
          `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${faker.person.fullName()}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software.`
        ), { leadingComments: [comment('MIT License')] }),
        prop('apache', raw(
          `Copyright ${new Date().getFullYear()} ${faker.company.name()}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0`
        ), { emptyLineBefore: true, leadingComments: [comment('Apache 2.0')] }),
        prop('header_style', str(faker.helpers.arrayElement(['block', 'line', 'banner'])), { emptyLineBefore: true }),
        prop('auto_insert', bool(true)),
      ]), [comment('License templates')]),
    }),
    () => ({
      title: 'Crontab',
      description: 'System crontab with commented schedule explanations.',
      document: doc(obj([
        prop('SHELL', str('/bin/bash')),
        prop('PATH', str('/usr/local/bin:/usr/bin:/bin')),
        prop('MAILTO', str(faker.internet.email()), { emptyLineBefore: true }),
        prop('jobs', obj([
          prop('backup', obj([
            prop('schedule', str('0 2 * * *')),
            prop('command', raw(`/usr/local/bin/backup.sh --target /mnt/backup\n  --compress gzip\n  --notify ${faker.internet.email()}`)),
          ]), {
            leadingComments: [comment('Full database backup at 2:00 AM daily')],
          }),
          prop('certbot', obj([
            prop('schedule', str('0 0 1 * *')),
            prop('command', str('certbot renew --quiet')),
          ]), {
            emptyLineBefore: true,
            leadingComments: [comment('Renew SSL certificates on the 1st of each month')],
          }),
          prop('logrotate', obj([
            prop('schedule', str('0 0 * * 0')),
            prop('command', raw(`/usr/sbin/logrotate /etc/logrotate.conf\nfind /var/log -name "*.gz" -mtime +30 -delete`)),
          ]), {
            emptyLineBefore: true,
            leadingComments: [comment('Weekly log rotation and cleanup')],
          }),
        ]), { emptyLineBefore: true }),
      ]), [comment('System crontab')]),
    }),
  ]
  return faker.helpers.arrayElement(templates)()
}

// ---------------------------------------------------------------------------
// Main: Generate examples and VitePress pages
// ---------------------------------------------------------------------------

const COUNT = 100
const ROOT = new URL('.', import.meta.url).pathname
const EXAMPLES_DIR = path.join(ROOT, 'doc')
const METADATA_PATH = path.join(ROOT, 'metadata.maml')
const SHAPES = [generateFlatConfig, generateNestedObject, generateTableArray, generateMixed, generateShowcase]

fs.mkdirSync(EXAMPLES_DIR, { recursive: true })

// Load existing metadata
let existing = []
if (fs.existsSync(METADATA_PATH)) {
  existing = parseValue(fs.readFileSync(METADATA_PATH, 'utf8'))
}

const startNum = existing.length > 0
  ? Math.max(...existing.map(e => Number(e.num))) + 1
  : 1

// Generate new examples
const newExamples = []

for (let i = 0; i < COUNT; i++) {
  const shapeIndex = Math.floor(i / 20)
  const generator = SHAPES[shapeIndex]
  const { document, title, description } = generator()
  const mamlText = print(document)

  // Validate: parse the generated MAML to ensure correctness
  try {
    parse(mamlText)
  } catch (err) {
    console.error(`Parse validation failed for example ${startNum + i}: ${err.message}`)
    process.exit(1)
  }

  const num = String(startNum + i).padStart(3, '0')
  newExamples.push({ num, title, description, shapeIndex, mamlText })
}

const allExamples = [...existing, ...newExamples]

// Write new example pages
for (const ex of newExamples) {
  const others = faker.helpers.arrayElements(
    allExamples.filter(e => e.num !== ex.num),
    3,
  )

  const md = `---
title: "${ex.num} - ${ex.title}"
---

# ${ex.num} - ${ex.title}

${ex.description} This is an example of a [MAML](https://maml.dev) document.

\`\`\`maml
${ex.mamlText}
\`\`\`

## See Also

${others.map(o => `- [${o.num} - ${o.title}](./${o.num})`).join('\n')}
`
  fs.writeFileSync(path.join(EXAMPLES_DIR, `${ex.num}.md`), md)
}

// Write metadata
fs.writeFileSync(METADATA_PATH, stringify(allExamples) + '\n')

// Regenerate index page: latest example per type
const latestByTitle = new Map()
for (const ex of allExamples) {
  latestByTitle.set(ex.title, ex)
}

const sortedLatest = [...latestByTitle.values()].sort((a, b) => {
  const si = a.shapeIndex - b.shapeIndex
  if (si !== 0) return si
  return a.title.localeCompare(b.title)
})

let indexMd = `---
title: MAML Examples
---

# MAML Examples

Example documents for the [MAML](https://maml.dev) data format.

`

for (const ex of sortedLatest) {
  indexMd += `- [${ex.title}](./doc/${ex.num})\n`
}
indexMd += '\n'

fs.writeFileSync(path.join(ROOT, 'index.md'), indexMd)

console.log(`Generated ${newExamples.length} new MAML examples (${allExamples.length} total)`)
