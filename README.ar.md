<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar"><strong>العربية</strong></a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

# 🚀 Kit Dev

<div dir="rtl">

أنشئ مشاريع Node.js + TypeScript مع بيئة تطوير وبناء للإنتاج واختبارات أصلية وحقن تبعيات اختياري. ينشئ Kit Dev المشروع ويثبّت التبعيات ويضبط الأوامر. يمكنك استخدامه دون تفعيل حقن التبعيات (DI).

## البدء السريع

اختر أحد الأوامر التالية:


<div dir="ltr">

```bash
npx create-kit-dev
pnpm create kit-dev
yarn create kit-dev
```

</div>


أدخل اسم المشروع، ثم نفّذ:


<div dir="ltr">

```bash
cd my-api
npm run dev
```

</div>


## الميزات المضمّنة

وضع `strict` في TypeScript؛ استخدام esbuild؛ إعادة تشغيل Node.js تلقائيًا بعد نجاح إعادة البناء؛ فحص الأنواع أثناء بناء الإنتاج؛ تصغير الشيفرة وخريطة مصدر منفصلة وملخص للحزمة؛ دعم npm وpnpm وYarn؛ اختبارات أصلية وحقن تبعيات اختياري دون decorators.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | يشغّل التطبيق ويراقب التغييرات |
| `npm run type` | يفحص أنواع TypeScript باستمرار |
| `npm test` | يشغّل الاختبارات مع مراقبة التغييرات؛ ويولّد اختبارًا عند تحديد هدف |
| `npm run build` | يفحص الأنواع وينشئ حزمة الإنتاج |
| `npm start` | يشغّل الحزمة الموجودة في dist |
| `npm run di` | يثبّت إعداد حقن التبعيات الاختياري |

مع pnpm استخدم `pnpm dev` و`pnpm build` وغيرها، ومع Yarn استخدم `yarn dev` و`yarn build` وغيرها. يمكنك تشغيل `npm run type` في طرفية أخرى. هذا اختياري لأن `build` يفحص الأنواع بالفعل.

## الاختبارات وتوليدها تلقائيًا

نفّذ `npm test`. يحوّل esbuild ملفات `.test.ts` و`.spec.ts`، ثم يشغّلها `node:test` مع استمرار مراقبة التغييرات. يتضمن المشروع اختبارًا أوليًا في `test/example.test.ts`. لا تُثبّت Jest أو Vitest أو ts-node أو tsx.

لتوليد اختبار، حدّد مسار ملف الصنف أو اسم ملف مصدر لا يطابق إلا ملفًا واحدًا:


<div dir="ltr">

```bash
npm test -- src/application/use-cases/create-user.ts
npm test -- create-user
pnpm test create-user
yarn test create-user
```

</div>


يحلّل المولّد شجرة AST في TypeScript للتعرّف على الصنف وتبعيات المُنشئ والأساليب العامة والاستدعاءات مثل `this.repository.save()`. ينشئ كائنات محاكاة باستخدام `t.mock.fn()` وتحققات من الاستدعاءات عندما يستطيع استنتاجها.

تستخدم الاختبارات المولّدة `describe` واحدًا للصنف و`it` باسم كل أسلوب. عندما يتعذّر استنتاج تحققات منطق العمل، يبقى الأسلوب قابلًا للتنفيذ مع تعليق `// TODO` لإضافة التحققات. لا يولّد `it.todo` ولا أجسام اختبارات معطّلة بالتعليقات. راجع الاختبارات وأكمل التحقق من قواعد العمل.

## البناء للإنتاج

ينفّذ `npm run build` فحص `tsc --noEmit`، ثم التجميع باستخدام esbuild، ثم التصغير وإنشاء خريطة المصدر. يعرض الملخص حجم الحزمة وعدد ملفات الإدخال والمدة الإجمالية. تبقى الحزم الموجودة في `dependencies` و`devDependencies` خارج الحزمة الناتجة. شغّل النتيجة باستخدام `npm start`.


<div dir="ltr">

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

</div>


## حقن التبعيات الاختياري

نفّذ `npm run di` مرة واحدة. ينشئ الأمر الحاوية ويفعّل المحوّل ويحذف السكربت `di` من `package.json`. بعد ذلك يعمل حقن التبعيات تلقائيًا مع `dev` و`build` دون decorators أو `reflect-metadata` أو مكتبات DI خارجية.

يسجّل `AppConfig` المزوّدات؛ ويستنتج المحوّل تبعيات المُنشئ حين يكون ذلك ممكنًا؛ وينشئ `ApplicationContext` النسخ ويوفّرها وقت التشغيل. يوجد الإعداد عادةً في `src/di/providers.ts`.

### مثال باستخدام واجهة

**العقد**


<div dir="ltr">

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

</div>


**التنفيذ**


<div dir="ltr">

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

</div>


**حالة الاستخدام**


<div dir="ltr">

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

</div>


**التسجيل**


<div dir="ltr">

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

</div>


**الاستخدام**


<div dir="ltr">

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

</div>


يربط المحوّل `UserRepository` بالتنفيذ `UserRepositoryMemory`. الواجهات غير موجودة وقت التشغيل: سجّل العقد باستخدام `useClass<Interface>(Implementation)` واحصل على نسخة من صنف فعلي باستخدام `container.get()`.

### التسجيل والحاوية

| API | السلوك |
|---|---|
| `useClass()` | يسجّل صنفًا؛ ويدعم أيضًا العقود والأصناف المجرّدة |
| `createToken<T>()` | ينشئ رمزًا من نوع symbol؛ احتفظ بالثابت نفسه وأعد استخدامه |
| `useValue()` | يسجّل قيمة أو نسخة موجودة |
| `useFactory()` | ينشئ تبعية بدالة تستقبل الحاوية |
| `useExisting()` | يوجّه الرمز إلى مزوّد آخر دون إنشاء نسخة جديدة |
| `imports()` | ينسخ مزوّدات AppConfig أخرى ويرفض الرموز المكررة |
| `providers.has()` | يتحقق من التسجيل قبل إنشاء الحاوية |
| `container.get()` | يجلب التبعية؛ ويصدر خطأ إن لم تكن مسجّلة |
| `container.getOptional()` | يعيد undefined إذا لم تكن التبعية مسجّلة |
| `container.has()` | يتحقق من وجود الرمز في الحاوية |
| `container.clearInstances()` | يمسح ذاكرة النسخ دون حذف التسجيلات أو إغلاق النسخ السابقة |
| `container.close()` | يستدعي dispose() أو close() للنسخ المفردة المخزنة ثم يمسح الذاكرة |

### النطاقات والقواعد

النطاق الافتراضي هو `singleton`: تُنشأ النسخة عند الطلب الأول ويُعاد استخدامها. ينشئ `transient` نسخة جديدة عند كل طلب؛ ولا تدير `close()` هذه النسخ.

سجّل جميع المزوّدات واستوردها قبل استدعاء `createApplicationContext()`، لأنه ينسخ الإعداد. يمكن ربط أساليب التسجيل على التوالي. استخدم `import type` للعقود. تتطلب الرموز التلقائية واجهات أو أسماء أنواع بديلة مسمّاة وغير عامة. للقيم الأولية والأنواع العامة والمعاملات الاختيارية أو المتبقية والأنواع التي يتعذر استنتاجها، قدّم الرموز يدويًا بترتيب معاملات المُنشئ.

الرموز المفقودة أو المكررة والتبعيات الدائرية وفشل إنشاء النسخ تؤدي إلى `DependencyInjectionError`. تظهر أخطاء المحوّل أثناء `dev` أو `build`.

## بنية المشروع


<div dir="ltr">

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

</div>


يضيف تثبيت DI أيضًا `kit-dev/di` و`src/di/providers.ts`. يُعد مجلد `kit-dev` جزءًا من إعداد المشروع ويمكن حفظه في Git.

## المتطلبات

Node.js 22 أو أحدث، مع npm أو pnpm أو Yarn. لا يلزم تثبيت عام.

## مرجع تفصيلي

راجع [المرجع الكامل بالإنجليزية](./README.md) للاطلاع على أمثلة إضافية لكل واجهة DI.

## الترخيص

[MIT](./LICENSE)

[Marcos Franco Marinho](https://github.com/marcosfrancomarinho)

**إعداد أقل. شيفرة أكثر.**

</div>
