<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi"><strong>हिन्दी</strong></a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

डेवलपमेंट, प्रोडक्शन बिल्ड, नेटिव टेस्ट और वैकल्पिक डिपेंडेंसी इंजेक्शन के साथ Node.js + TypeScript प्रोजेक्ट बनाएँ। Kit Dev प्रोजेक्ट बनाता है, डिपेंडेंसी इंस्टॉल करता है और कमांड कॉन्फ़िगर करता है। डिपेंडेंसी इंजेक्शन (DI) चालू करना ज़रूरी नहीं है।

## शुरुआत करें

इनमें से कोई एक कमांड चुनें:

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

प्रोजेक्ट का नाम दर्ज करें, फिर चलाएँ:

```bash
cd my-api
npm run dev
```

## शामिल सुविधाएँ

TypeScript का `strict` मोड; esbuild; सफल रीबिल्ड के बाद Node.js का अपने आप रीस्टार्ट होना; प्रोडक्शन बिल्ड के दौरान टाइप जाँच; मिनिफिकेशन, अलग source map और bundle का सारांश; npm, pnpm और Yarn का समर्थन; नेटिव टेस्ट और बिना डेकोरेटर वाला वैकल्पिक DI।

## कमांड

| कमांड | काम |
|---|---|
| `npm run dev` | ऐप चलाता है और बदलावों पर नज़र रखता है |
| `npm run type` | TypeScript के टाइप लगातार जाँचता है |
| `npm test` | वॉच मोड में टेस्ट चलाता है; लक्ष्य देने पर टेस्ट बनाता है |
| `npm run build` | टाइप जाँचकर प्रोडक्शन bundle बनाता है |
| `npm start` | dist में बना bundle चलाता है |
| `npm run di` | वैकल्पिक DI सेटअप इंस्टॉल करता है |

pnpm के साथ `pnpm dev`, `pnpm build` आदि और Yarn के साथ `yarn dev`, `yarn build` आदि चलाएँ। `npm run type` अलग टर्मिनल में चलाया जा सकता है। यह वैकल्पिक है क्योंकि `build` पहले से टाइप जाँचता है।

## टेस्ट और अपने आप टेस्ट बनाना

`npm test` चलाएँ। esbuild `.test.ts` और `.spec.ts` फ़ाइलों को ट्रांसपाइल करता है और `node:test` उन्हें चलाकर बदलावों पर नज़र रखता है। शुरुआती टेस्ट `test/example.test.ts` में मिलता है। Jest, Vitest, ts-node और tsx इंस्टॉल नहीं किए जाते।

टेस्ट बनाने के लिए क्लास की फ़ाइल का पथ या ऐसा फ़ाइल नाम दें जो केवल एक स्रोत फ़ाइल से मेल खाता हो:

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

जनरेटर TypeScript AST का विश्लेषण करके क्लास, कंस्ट्रक्टर की डिपेंडेंसी, सार्वजनिक मेथड और `this.repository.save()` जैसी कॉल पहचानता है। जहाँ अनुमान संभव हो, वह `t.mock.fn()` से मॉक और कॉल की जाँच करने वाले assertions बनाता है।


## प्रोडक्शन बिल्ड

`npm run build` क्रम से `tsc --noEmit`, esbuild bundling, मिनिफिकेशन और source map बनाना चलाता है। सारांश में आकार, इनपुट फ़ाइलों की संख्या और कुल समय दिखता है। `dependencies` और `devDependencies` के पैकेज bundle के बाहर रहते हैं। परिणाम चलाने के लिए `npm start` इस्तेमाल करें।

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

## वैकल्पिक डिपेंडेंसी इंजेक्शन

`npm run di` एक बार चलाएँ। यह कंटेनर बनाता है, ट्रांसफ़ॉर्मर चालू करता है और `package.json` से `di` स्क्रिप्ट हटा देता है। इसके बाद DI अपने आप `dev` और `build` के साथ काम करता है। डेकोरेटर, `reflect-metadata` या बाहरी DI लाइब्रेरी की ज़रूरत नहीं है।

`AppConfig` प्रोवाइडर रजिस्टर करता है; ट्रांसफ़ॉर्मर जहाँ संभव हो कंस्ट्रक्टर की डिपेंडेंसी का अनुमान लगाता है; `ApplicationContext` रनटाइम पर इंस्टेंस बनाता और उपलब्ध कराता है। कॉन्फ़िगरेशन आमतौर पर `src/di/providers.ts` में रहता है।

### इंटरफ़ेस का उदाहरण

**कॉन्ट्रैक्ट**

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

**इम्प्लीमेंटेशन**

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

**यूज़ केस**

```ts
// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

**रजिस्ट्रेशन**

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

**इस्तेमाल**

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

ट्रांसफ़ॉर्मर `UserRepository` को `UserRepositoryMemory` से जोड़ता है। इंटरफ़ेस रनटाइम पर मौजूद नहीं होते: कॉन्ट्रैक्ट को `useClass<Interface>(Implementation)` से रजिस्टर करें और ठोस क्लास को `container.get()` से प्राप्त करें।

### रजिस्ट्रेशन और कंटेनर

| API | व्यवहार |
|---|---|
| `useClass()` | क्लास रजिस्टर करता है; कॉन्ट्रैक्ट और abstract क्लास भी समर्थित हैं |
| `createToken<T>()` | symbol टोकन बनाता है; उसी constant को सुरक्षित रखकर दोबारा इस्तेमाल करें |
| `useValue()` | मौजूदा वैल्यू या इंस्टेंस रजिस्टर करता है |
| `useFactory()` | कंटेनर प्राप्त करने वाले फ़ंक्शन से डिपेंडेंसी बनाता है |
| `useExisting()` | नया इंस्टेंस बनाए बिना टोकन को दूसरे प्रोवाइडर से जोड़ता है |
| `imports()` | दूसरे AppConfig के प्रोवाइडर कॉपी करता है; डुप्लिकेट टोकन अस्वीकार करता है |
| `providers.has()` | कंटेनर बनाने से पहले रजिस्ट्रेशन जाँचता है |
| `container.get()` | डिपेंडेंसी प्राप्त करता है; रजिस्ट्रेशन न होने पर त्रुटि देता है |
| `container.getOptional()` | रजिस्ट्रेशन न होने पर undefined देता है |
| `container.has()` | कंटेनर में टोकन मौजूद है या नहीं, जाँचता है |
| `container.clearInstances()` | रजिस्ट्रेशन हटाए या पुराने इंस्टेंस बंद किए बिना कैश साफ़ करता है |
| `container.close()` | सहेजे गए singleton पर dispose() या close() चलाकर कैश साफ़ करता है |

### स्कोप और नियम

डिफ़ॉल्ट स्कोप `singleton` है: पहली बार माँगने पर इंस्टेंस बनता है और आगे वही इस्तेमाल होता है। `transient` हर बार नया इंस्टेंस बनाता है; `close()` इन इंस्टेंस को मैनेज नहीं करता।

`createApplicationContext()` से पहले सभी प्रोवाइडर रजिस्टर और इम्पोर्ट करें, क्योंकि यह कॉन्फ़िगरेशन की कॉपी लेता है। रजिस्ट्रेशन मेथड की chaining संभव है। कॉन्ट्रैक्ट के लिए `import type` इस्तेमाल करें। ऑटोमैटिक टोकन के लिए नाम वाले, non-generic इंटरफ़ेस या type alias चाहिए। primitive वैल्यू, generic टाइप, optional या rest पैरामीटर और जिन टाइप का अनुमान संभव न हो, उनके लिए कंस्ट्रक्टर के क्रम में टोकन खुद दें।

गायब या डुप्लिकेट टोकन, चक्रीय डिपेंडेंसी और इंस्टेंस बनाते समय विफलता पर `DependencyInjectionError` मिलता है। ट्रांसफ़ॉर्मर की त्रुटियाँ `dev` या `build` के दौरान दिखती हैं।

## प्रोजेक्ट की संरचना

```text
my-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── test/
│       ├── test.cjs
│       └── generator.cjs
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
├── package.json
└── tsconfig.json
```

DI इंस्टॉल करने पर `kit-dev/di` और `src/di/providers.ts` भी जुड़ते हैं। `kit-dev` फ़ोल्डर प्रोजेक्ट कॉन्फ़िगरेशन का हिस्सा है और इसे Git में कमिट किया जा सकता है।

## ज़रूरतें

Node.js 22 या नया संस्करण और npm, pnpm या Yarn। ग्लोबल इंस्टॉलेशन ज़रूरी नहीं है।

## विस्तृत संदर्भ

हर DI API के और उदाहरण [अंग्रेज़ी के पूर्ण संदर्भ](./README.md) में देखें।

## लाइसेंस

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**कम कॉन्फ़िगरेशन। ज़्यादा कोड।**
