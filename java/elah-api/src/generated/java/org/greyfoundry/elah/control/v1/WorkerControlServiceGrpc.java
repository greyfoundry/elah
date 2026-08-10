package org.greyfoundry.elah.control.v1;

import static io.grpc.MethodDescriptor.generateFullMethodName;

/**
 * <pre>
 * Laboratory control-plane operations implemented by elahd.
 * </pre>
 */
@io.grpc.stub.annotations.GrpcGenerated
public final class WorkerControlServiceGrpc {

  private WorkerControlServiceGrpc() {}

  public static final java.lang.String SERVICE_NAME = "elah.control.v1.WorkerControlService";

  // Static method descriptors that strictly reflect the proto.
  private static volatile io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.RegisterWorkerRequest,
      org.greyfoundry.elah.control.v1.RegisterWorkerResponse> getRegisterWorkerMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "RegisterWorker",
      requestType = org.greyfoundry.elah.control.v1.RegisterWorkerRequest.class,
      responseType = org.greyfoundry.elah.control.v1.RegisterWorkerResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.RegisterWorkerRequest,
      org.greyfoundry.elah.control.v1.RegisterWorkerResponse> getRegisterWorkerMethod() {
    io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.RegisterWorkerRequest, org.greyfoundry.elah.control.v1.RegisterWorkerResponse> getRegisterWorkerMethod;
    if ((getRegisterWorkerMethod = WorkerControlServiceGrpc.getRegisterWorkerMethod) == null) {
      synchronized (WorkerControlServiceGrpc.class) {
        if ((getRegisterWorkerMethod = WorkerControlServiceGrpc.getRegisterWorkerMethod) == null) {
          WorkerControlServiceGrpc.getRegisterWorkerMethod = getRegisterWorkerMethod =
              io.grpc.MethodDescriptor.<org.greyfoundry.elah.control.v1.RegisterWorkerRequest, org.greyfoundry.elah.control.v1.RegisterWorkerResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "RegisterWorker"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  org.greyfoundry.elah.control.v1.RegisterWorkerRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  org.greyfoundry.elah.control.v1.RegisterWorkerResponse.getDefaultInstance()))
              .setSchemaDescriptor(new WorkerControlServiceMethodDescriptorSupplier("RegisterWorker"))
              .build();
        }
      }
    }
    return getRegisterWorkerMethod;
  }

  private static volatile io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.HeartbeatRequest,
      org.greyfoundry.elah.control.v1.HeartbeatResponse> getHeartbeatMethod;

  @io.grpc.stub.annotations.RpcMethod(
      fullMethodName = SERVICE_NAME + '/' + "Heartbeat",
      requestType = org.greyfoundry.elah.control.v1.HeartbeatRequest.class,
      responseType = org.greyfoundry.elah.control.v1.HeartbeatResponse.class,
      methodType = io.grpc.MethodDescriptor.MethodType.UNARY)
  public static io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.HeartbeatRequest,
      org.greyfoundry.elah.control.v1.HeartbeatResponse> getHeartbeatMethod() {
    io.grpc.MethodDescriptor<org.greyfoundry.elah.control.v1.HeartbeatRequest, org.greyfoundry.elah.control.v1.HeartbeatResponse> getHeartbeatMethod;
    if ((getHeartbeatMethod = WorkerControlServiceGrpc.getHeartbeatMethod) == null) {
      synchronized (WorkerControlServiceGrpc.class) {
        if ((getHeartbeatMethod = WorkerControlServiceGrpc.getHeartbeatMethod) == null) {
          WorkerControlServiceGrpc.getHeartbeatMethod = getHeartbeatMethod =
              io.grpc.MethodDescriptor.<org.greyfoundry.elah.control.v1.HeartbeatRequest, org.greyfoundry.elah.control.v1.HeartbeatResponse>newBuilder()
              .setType(io.grpc.MethodDescriptor.MethodType.UNARY)
              .setFullMethodName(generateFullMethodName(SERVICE_NAME, "Heartbeat"))
              .setSampledToLocalTracing(true)
              .setRequestMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  org.greyfoundry.elah.control.v1.HeartbeatRequest.getDefaultInstance()))
              .setResponseMarshaller(io.grpc.protobuf.ProtoUtils.marshaller(
                  org.greyfoundry.elah.control.v1.HeartbeatResponse.getDefaultInstance()))
              .setSchemaDescriptor(new WorkerControlServiceMethodDescriptorSupplier("Heartbeat"))
              .build();
        }
      }
    }
    return getHeartbeatMethod;
  }

  /**
   * Creates a new async stub that supports all call types for the service
   */
  public static WorkerControlServiceStub newStub(io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceStub>() {
        @java.lang.Override
        public WorkerControlServiceStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new WorkerControlServiceStub(channel, callOptions);
        }
      };
    return WorkerControlServiceStub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports all types of calls on the service
   */
  public static WorkerControlServiceBlockingV2Stub newBlockingV2Stub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceBlockingV2Stub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceBlockingV2Stub>() {
        @java.lang.Override
        public WorkerControlServiceBlockingV2Stub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new WorkerControlServiceBlockingV2Stub(channel, callOptions);
        }
      };
    return WorkerControlServiceBlockingV2Stub.newStub(factory, channel);
  }

  /**
   * Creates a new blocking-style stub that supports unary and streaming output calls on the service
   */
  public static WorkerControlServiceBlockingStub newBlockingStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceBlockingStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceBlockingStub>() {
        @java.lang.Override
        public WorkerControlServiceBlockingStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new WorkerControlServiceBlockingStub(channel, callOptions);
        }
      };
    return WorkerControlServiceBlockingStub.newStub(factory, channel);
  }

  /**
   * Creates a new ListenableFuture-style stub that supports unary calls on the service
   */
  public static WorkerControlServiceFutureStub newFutureStub(
      io.grpc.Channel channel) {
    io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceFutureStub> factory =
      new io.grpc.stub.AbstractStub.StubFactory<WorkerControlServiceFutureStub>() {
        @java.lang.Override
        public WorkerControlServiceFutureStub newStub(io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
          return new WorkerControlServiceFutureStub(channel, callOptions);
        }
      };
    return WorkerControlServiceFutureStub.newStub(factory, channel);
  }

  /**
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public interface AsyncService {

    /**
     * <pre>
     * Starts or resumes the current process session for a stable worker identity.
     * </pre>
     */
    default void registerWorker(org.greyfoundry.elah.control.v1.RegisterWorkerRequest request,
        io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.RegisterWorkerResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getRegisterWorkerMethod(), responseObserver);
    }

    /**
     * <pre>
     * Replaces the last accepted load sample for the current worker session.
     * </pre>
     */
    default void heartbeat(org.greyfoundry.elah.control.v1.HeartbeatRequest request,
        io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.HeartbeatResponse> responseObserver) {
      io.grpc.stub.ServerCalls.asyncUnimplementedUnaryCall(getHeartbeatMethod(), responseObserver);
    }
  }

  /**
   * Base class for the server implementation of the service WorkerControlService.
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public static abstract class WorkerControlServiceImplBase
      implements io.grpc.BindableService, AsyncService {

    @java.lang.Override public final io.grpc.ServerServiceDefinition bindService() {
      return WorkerControlServiceGrpc.bindService(this);
    }
  }

  /**
   * A stub to allow clients to do asynchronous rpc calls to service WorkerControlService.
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public static final class WorkerControlServiceStub
      extends io.grpc.stub.AbstractAsyncStub<WorkerControlServiceStub> {
    private WorkerControlServiceStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected WorkerControlServiceStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new WorkerControlServiceStub(channel, callOptions);
    }

    /**
     * <pre>
     * Starts or resumes the current process session for a stable worker identity.
     * </pre>
     */
    public void registerWorker(org.greyfoundry.elah.control.v1.RegisterWorkerRequest request,
        io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.RegisterWorkerResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getRegisterWorkerMethod(), getCallOptions()), request, responseObserver);
    }

    /**
     * <pre>
     * Replaces the last accepted load sample for the current worker session.
     * </pre>
     */
    public void heartbeat(org.greyfoundry.elah.control.v1.HeartbeatRequest request,
        io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.HeartbeatResponse> responseObserver) {
      io.grpc.stub.ClientCalls.asyncUnaryCall(
          getChannel().newCall(getHeartbeatMethod(), getCallOptions()), request, responseObserver);
    }
  }

  /**
   * A stub to allow clients to do synchronous rpc calls to service WorkerControlService.
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public static final class WorkerControlServiceBlockingV2Stub
      extends io.grpc.stub.AbstractBlockingStub<WorkerControlServiceBlockingV2Stub> {
    private WorkerControlServiceBlockingV2Stub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected WorkerControlServiceBlockingV2Stub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new WorkerControlServiceBlockingV2Stub(channel, callOptions);
    }

    /**
     * <pre>
     * Starts or resumes the current process session for a stable worker identity.
     * </pre>
     */
    public org.greyfoundry.elah.control.v1.RegisterWorkerResponse registerWorker(org.greyfoundry.elah.control.v1.RegisterWorkerRequest request) throws io.grpc.StatusException {
      return io.grpc.stub.ClientCalls.blockingV2UnaryCall(
          getChannel(), getRegisterWorkerMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Replaces the last accepted load sample for the current worker session.
     * </pre>
     */
    public org.greyfoundry.elah.control.v1.HeartbeatResponse heartbeat(org.greyfoundry.elah.control.v1.HeartbeatRequest request) throws io.grpc.StatusException {
      return io.grpc.stub.ClientCalls.blockingV2UnaryCall(
          getChannel(), getHeartbeatMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do limited synchronous rpc calls to service WorkerControlService.
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public static final class WorkerControlServiceBlockingStub
      extends io.grpc.stub.AbstractBlockingStub<WorkerControlServiceBlockingStub> {
    private WorkerControlServiceBlockingStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected WorkerControlServiceBlockingStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new WorkerControlServiceBlockingStub(channel, callOptions);
    }

    /**
     * <pre>
     * Starts or resumes the current process session for a stable worker identity.
     * </pre>
     */
    public org.greyfoundry.elah.control.v1.RegisterWorkerResponse registerWorker(org.greyfoundry.elah.control.v1.RegisterWorkerRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getRegisterWorkerMethod(), getCallOptions(), request);
    }

    /**
     * <pre>
     * Replaces the last accepted load sample for the current worker session.
     * </pre>
     */
    public org.greyfoundry.elah.control.v1.HeartbeatResponse heartbeat(org.greyfoundry.elah.control.v1.HeartbeatRequest request) {
      return io.grpc.stub.ClientCalls.blockingUnaryCall(
          getChannel(), getHeartbeatMethod(), getCallOptions(), request);
    }
  }

  /**
   * A stub to allow clients to do ListenableFuture-style rpc calls to service WorkerControlService.
   * <pre>
   * Laboratory control-plane operations implemented by elahd.
   * </pre>
   */
  public static final class WorkerControlServiceFutureStub
      extends io.grpc.stub.AbstractFutureStub<WorkerControlServiceFutureStub> {
    private WorkerControlServiceFutureStub(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      super(channel, callOptions);
    }

    @java.lang.Override
    protected WorkerControlServiceFutureStub build(
        io.grpc.Channel channel, io.grpc.CallOptions callOptions) {
      return new WorkerControlServiceFutureStub(channel, callOptions);
    }

    /**
     * <pre>
     * Starts or resumes the current process session for a stable worker identity.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<org.greyfoundry.elah.control.v1.RegisterWorkerResponse> registerWorker(
        org.greyfoundry.elah.control.v1.RegisterWorkerRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getRegisterWorkerMethod(), getCallOptions()), request);
    }

    /**
     * <pre>
     * Replaces the last accepted load sample for the current worker session.
     * </pre>
     */
    public com.google.common.util.concurrent.ListenableFuture<org.greyfoundry.elah.control.v1.HeartbeatResponse> heartbeat(
        org.greyfoundry.elah.control.v1.HeartbeatRequest request) {
      return io.grpc.stub.ClientCalls.futureUnaryCall(
          getChannel().newCall(getHeartbeatMethod(), getCallOptions()), request);
    }
  }

  private static final int METHODID_REGISTER_WORKER = 0;
  private static final int METHODID_HEARTBEAT = 1;

  private static final class MethodHandlers<Req, Resp> implements
      io.grpc.stub.ServerCalls.UnaryMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ServerStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.ClientStreamingMethod<Req, Resp>,
      io.grpc.stub.ServerCalls.BidiStreamingMethod<Req, Resp> {
    private final AsyncService serviceImpl;
    private final int methodId;

    MethodHandlers(AsyncService serviceImpl, int methodId) {
      this.serviceImpl = serviceImpl;
      this.methodId = methodId;
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public void invoke(Req request, io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        case METHODID_REGISTER_WORKER:
          serviceImpl.registerWorker((org.greyfoundry.elah.control.v1.RegisterWorkerRequest) request,
              (io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.RegisterWorkerResponse>) responseObserver);
          break;
        case METHODID_HEARTBEAT:
          serviceImpl.heartbeat((org.greyfoundry.elah.control.v1.HeartbeatRequest) request,
              (io.grpc.stub.StreamObserver<org.greyfoundry.elah.control.v1.HeartbeatResponse>) responseObserver);
          break;
        default:
          throw new AssertionError();
      }
    }

    @java.lang.Override
    @java.lang.SuppressWarnings("unchecked")
    public io.grpc.stub.StreamObserver<Req> invoke(
        io.grpc.stub.StreamObserver<Resp> responseObserver) {
      switch (methodId) {
        default:
          throw new AssertionError();
      }
    }
  }

  public static final io.grpc.ServerServiceDefinition bindService(AsyncService service) {
    return io.grpc.ServerServiceDefinition.builder(getServiceDescriptor())
        .addMethod(
          getRegisterWorkerMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              org.greyfoundry.elah.control.v1.RegisterWorkerRequest,
              org.greyfoundry.elah.control.v1.RegisterWorkerResponse>(
                service, METHODID_REGISTER_WORKER)))
        .addMethod(
          getHeartbeatMethod(),
          io.grpc.stub.ServerCalls.asyncUnaryCall(
            new MethodHandlers<
              org.greyfoundry.elah.control.v1.HeartbeatRequest,
              org.greyfoundry.elah.control.v1.HeartbeatResponse>(
                service, METHODID_HEARTBEAT)))
        .build();
  }

  private static abstract class WorkerControlServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoFileDescriptorSupplier, io.grpc.protobuf.ProtoServiceDescriptorSupplier {
    WorkerControlServiceBaseDescriptorSupplier() {}

    @java.lang.Override
    public com.google.protobuf.Descriptors.FileDescriptor getFileDescriptor() {
      return org.greyfoundry.elah.control.v1.WorkerControlProto.getDescriptor();
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.ServiceDescriptor getServiceDescriptor() {
      return getFileDescriptor().findServiceByName("WorkerControlService");
    }
  }

  private static final class WorkerControlServiceFileDescriptorSupplier
      extends WorkerControlServiceBaseDescriptorSupplier {
    WorkerControlServiceFileDescriptorSupplier() {}
  }

  private static final class WorkerControlServiceMethodDescriptorSupplier
      extends WorkerControlServiceBaseDescriptorSupplier
      implements io.grpc.protobuf.ProtoMethodDescriptorSupplier {
    private final java.lang.String methodName;

    WorkerControlServiceMethodDescriptorSupplier(java.lang.String methodName) {
      this.methodName = methodName;
    }

    @java.lang.Override
    public com.google.protobuf.Descriptors.MethodDescriptor getMethodDescriptor() {
      return getServiceDescriptor().findMethodByName(methodName);
    }
  }

  private static volatile io.grpc.ServiceDescriptor serviceDescriptor;

  public static io.grpc.ServiceDescriptor getServiceDescriptor() {
    io.grpc.ServiceDescriptor result = serviceDescriptor;
    if (result == null) {
      synchronized (WorkerControlServiceGrpc.class) {
        result = serviceDescriptor;
        if (result == null) {
          serviceDescriptor = result = io.grpc.ServiceDescriptor.newBuilder(SERVICE_NAME)
              .setSchemaDescriptor(new WorkerControlServiceFileDescriptorSupplier())
              .addMethod(getRegisterWorkerMethod())
              .addMethod(getHeartbeatMethod())
              .build();
        }
      }
    }
    return result;
  }
}
