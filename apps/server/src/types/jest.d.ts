/**
 * Jest type definitions for non-test files
 * This allows using jest mock functions in factory files for dependency injection
 */

declare global {
  namespace jest {
    interface MockedFunction<T extends (...args: any[]) => any> extends jest.Mock<ReturnType<T>, Parameters<T>> {}
    
    interface Mock<T = any, Y extends any[] = any> extends Function, MockInstance<T, Y> {
      new (...args: Y): T;
      (...args: Y): T;
    }

    interface MockInstance<T, Y extends any[]> {
      mockClear(): void;
      mockReset(): void;
      mockRestore(): void;
      mockImplementation(fn?: (...args: Y) => T): MockInstance<T, Y>;
      mockImplementationOnce(fn?: (...args: Y) => T): MockInstance<T, Y>;
      mockReturnThis(): MockInstance<T, Y>;
      mockReturnValue(value: T): MockInstance<T, Y>;
      mockReturnValueOnce(value: T): MockInstance<T, Y>;
      mockResolvedValue(value: Awaited<T>): MockInstance<T, Y>;
      mockResolvedValueOnce(value: Awaited<T>): MockInstance<T, Y>;
      mockRejectedValue(value: any): MockInstance<T, Y>;
      mockRejectedValueOnce(value: any): MockInstance<T, Y>;
    }
  }

  interface JestFn {
    fn<T extends (...args: any[]) => any>(): jest.MockedFunction<T>;
    fn<T extends (...args: any[]) => any>(implementation?: T): jest.MockedFunction<T>;
  }

  const jest: JestFn;
}

export {};
