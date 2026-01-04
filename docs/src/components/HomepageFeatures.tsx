import Heading from '@theme/Heading';
import styles from './HomepageFeatures.module.css';
import type { ComponentType, ComponentProps, ReactNode } from 'react';

type FeatureItem = {
  title: string;
  Svg: ComponentType<ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Easy to Use',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Install and configure Claude Code Router in minutes with our simple CLI.
        Start routing your Claude Code requests to any LLM provider instantly.
      </>
    ),
  },
  {
    title: 'Flexible Routing',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Configure custom routing logic based on project, context length, or task type.
        Built-in scenarios for background tasks, thinking mode, web search, and more.
      </>
    ),
  },
  {
    title: 'Provider Agnostic',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Support for multiple LLM providers including DeepSeek, Gemini, Groq, and OpenRouter.
        Easy to extend with custom transformers for new providers.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={styles.feature}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <div key={idx} className="col col--4">
              <Feature {...props} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
