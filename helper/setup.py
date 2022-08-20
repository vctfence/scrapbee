from setuptools import setup, find_packages

setup(
    name='scrapyard_helper',
    version='1.2',
    packages=['scrapyard'],
    url='',
    license='',
    author='gchristnsn',
    author_email='gchristnsn@gmail.com',
    description='',
    install_requires=['Flask'],
    entry_points = {
        'console_scripts': ['scrapyard_helper=scrapyard.helper:main'],
    },
    package_data = {
        '': ['*.png']
    }
)
