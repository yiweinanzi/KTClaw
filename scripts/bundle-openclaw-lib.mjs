export function getBundleRootPackages() {
  return [
    'openclaw',
    '@larksuiteoapi/node-sdk',
    // '@whiskeysockets/baileys', // WhatsApp Web API — disabled
  ];
}

export function getBundledNestedDependencyRepairs() {
  return [
    {
      packageName: 'hosted-git-info',
      dependencyName: 'lru-cache',
    },
  ];
}
