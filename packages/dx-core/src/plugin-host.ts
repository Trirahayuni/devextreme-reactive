import { insertPlugin, removePlugin } from './utils';
import { Getters } from '@devexpress/dx-react-core';

const getDependencyError = (
  pluginName, dependencyName,
  ) => new Error(
    `The '${pluginName}' plugin requires '${dependencyName}' to be defined before it.`,
  );

/** @internal */
export type PluginPositionFn = () => number[];

export interface IDependency { name: string; optional?: boolean; }

/** @internal */
export type InnerPlugin = {
  position: PluginPositionFn;
  name?: string;
  dependencies?: IDependency[];
} & Getters;

/** @internal */
export class PluginHost {
  private plugins: InnerPlugin[];
  private subscriptions: Set<any>;
  private gettersCache: object = {};
  private knownKeysCache: object = {};
  private validationRequired: boolean = true;

  constructor() {
    this.plugins = [];
    this.subscriptions = new Set();
  }

  ensureDependencies() {
    const defined: Set<string> = new Set();
    const knownOptionals: Map<string, string> = new Map();
    this.plugins
      .filter(plugin => plugin.container)
      .forEach((plugin) => {
        const pluginName = plugin.name || '';
        if (knownOptionals.has(pluginName)) {
          throw (getDependencyError(knownOptionals.get(pluginName), pluginName));
        }

        (plugin.dependencies || [])
          .forEach((dependency) => {
            if (defined.has(dependency.name)) return;
            if (dependency.optional) {
              if (!knownOptionals.has(dependency.name)) {
                knownOptionals.set(dependency.name, pluginName);
              }
              return;
            }
            throw (getDependencyError(pluginName, dependency.name));
          });

        defined.add(pluginName);
      });
  }

  registerPlugin(plugin) {
    this.plugins = insertPlugin(this.plugins, plugin);
    this.cleanPluginsCache();
  }

  unregisterPlugin(plugin) {
    this.plugins = removePlugin(this.plugins, plugin);
    this.cleanPluginsCache();
  }

  knownKeys(postfix) {
    if (!this.knownKeysCache[postfix]) {
      this.knownKeysCache[postfix] = Array.from(this.plugins
        .map(plugin => Object.keys(plugin))
        .map(keys => keys.filter(key => key.endsWith(postfix))[0])
        .filter(key => !!key)
        .reduce((acc, key) => acc.add(key), new Set()))
        .map(key => key.replace(postfix, ''));
    }
    return this.knownKeysCache[postfix];
  }

  collect(key, upTo?) {
    if (this.validationRequired) {
      this.ensureDependencies();
      this.validationRequired = false;
    }

    if (!this.gettersCache[key]) {
      this.gettersCache[key] = this.plugins.map(plugin => plugin[key]).filter(plugin => !!plugin);
    }
    if (!upTo) return this.gettersCache[key];

    const upToIndex = this.plugins.indexOf(upTo);
    return this.gettersCache[key].filter((getter) => {
      const pluginIndex = this.plugins.findIndex(plugin => plugin[key] === getter);
      return pluginIndex < upToIndex;
    });
  }

  get(key, upTo) {
    const plugins = this.collect(key, upTo);

    if (!plugins.length) return undefined;

    let result = plugins[0]();
    plugins.slice(1).forEach((plugin) => {
      result = plugin(result);
    });
    return result;
  }

  registerSubscription(subscription) {
    this.subscriptions.add(subscription);
  }

  unregisterSubscription(subscription) {
    this.subscriptions.delete(subscription);
  }

  broadcast(event, message?: any) {
    this.subscriptions.forEach(subscription => subscription[event] && subscription[event](message));
  }

  private cleanPluginsCache() {
    this.validationRequired = true;
    this.gettersCache = {};
    this.knownKeysCache = {};
  }
}
