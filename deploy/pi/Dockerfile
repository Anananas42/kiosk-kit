FROM debian:bookworm-slim

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install all required tools for QEMU-based image building.
# linux-image-amd64 provides a kernel for libguestfs's internal appliance.
# LIBGUESTFS_BACKEND=direct avoids the need for libvirt inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    qemu-system-arm \
    qemu-utils \
    libguestfs-tools \
    linux-image-amd64 \
    ansible \
    sshpass \
    openssh-client \
    curl \
    xz-utils \
    dpkg-dev \
    cpio \
    parted \
    python3 \
    rsync \
    && rm -rf /var/lib/apt/lists/*

ENV LIBGUESTFS_BACKEND=direct

# Marker file so the script can detect it's inside the container
RUN touch /.sd-builder-container

WORKDIR /workspace
COPY . /workspace/

# Ensure scripts are executable
RUN chmod +x deploy/pi/build-sd-image.sh deploy/pi/lib/common.sh
