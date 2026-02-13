export type Variable<T> = {
    get: () => T
    set: (value: T) => void
    update: (fn: (prev: T) => T) => void
    subscribe: (callback: (value: T) => void) => () => void
}

export function createVariable<T>(initial: T): Variable<T> {
    let value = initial
    const subscribers = new Set<(value: T) => void>()

    const notify = () => {
        for (const callback of subscribers) {
            callback(value)
        }
    }

    return {
        get: () => value,
        set: (next: T) => {
            if (Object.is(value, next)) return
            value = next
            notify()
        },
        update: (fn: (prev: T) => T) => {
            const next = fn(value)
            if (Object.is(value, next)) return
            value = next
            notify()
        },
        subscribe: (callback: (value: T) => void) => {
            subscribers.add(callback)
            callback(value)
            return () => subscribers.delete(callback)
        },
    }
}
