FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV USER=root

# Install XFCE Desktop, TigerVNC, OpenSSH Server, and utilities
RUN apt-get update && apt-get install -y \
    xfce4 \
    xfce4-terminal \
    tigervnc-standalone-server \
    tigervnc-common \
    openssh-server \
    sudo \
    curl \
    wget \
    net-tools \
    procps \
    htop \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH
RUN mkdir /var/run/sshd
RUN echo 'root:secret' | chpasswd
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Configure VNC
RUN mkdir -p /root/.vnc
RUN echo "secret" | vncpasswd -f > /root/.vnc/passwd
RUN chmod 600 /root/.vnc/passwd

# Xstartup script
RUN echo '#!/bin/sh\nunset SESSION_MANAGER\nunset DBUS_SESSION_BUS_ADDRESS\nexec startxfce4' > /root/.vnc/xstartup
RUN chmod +x /root/.vnc/xstartup

COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 5900 22

CMD ["/startup.sh"]
